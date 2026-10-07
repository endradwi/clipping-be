import { CreateClipSchema, ClipJobEntity } from '../models/clip.model';
import { renderMutex } from '../common/mutex.guard';
import { ytdlpService } from '../services/ytdlp.service';
import { ffmpegService } from '../services/ffmpeg.service';
import { storageService } from '../services/storage.service';
import { dbService } from '../services/db.service';
import { successResponse, errorResponse } from '../views/response.view';
import { logger } from '../common/logger';

// In-memory subscribers for SSE progress streaming
const progressSubscribers = new Map<string, Array<(data: any) => void>>();

function emitProgress(jobId: string, event: Partial<ClipJobEntity>) {
  const subs = progressSubscribers.get(jobId) || [];
  for (const sub of subs) {
    try {
      sub(event);
    } catch {}
  }
}

export class ClipController {
  public async triggerRender({ body }: { body: any }) {
    const parse = CreateClipSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid clip parameters', 'VALIDATION_ERROR', 422);
    }

    const input = parse.data;
    const mutexKey = renderMutex.generateKey(input.url, input.start, input.end);
    const jobId = crypto.randomUUID();

    try {
      renderMutex.acquire(mutexKey, jobId);
    } catch (err: any) {
      return errorResponse(err.message, 'CONFLICT', 409);
    }

    const jobEntity: ClipJobEntity = {
      id: jobId,
      url: input.url,
      title: input.title || 'Untitled Clip',
      start: input.start,
      end: input.end,
      duration: Math.round(input.end - input.start),
      status: 'queued',
      progressPercent: 5,
      burnSubtitles: input.burnSubtitles,
      r2Url: null,
      error: null,
      createdAt: new Date().toISOString()
    };

    await dbService.saveJob(jobEntity);

    // Fire & Forget background pipeline execution
    (async () => {
      try {
        // Step 1: Resolve stream URLs (video + audio)
        jobEntity.status = 'downloading';
        jobEntity.progressPercent = 20;
        await dbService.saveJob(jobEntity);
        emitProgress(jobId, { status: 'downloading', progressPercent: 20 });

        const { videoUrl, audioUrl } = await ytdlpService.getDirectStreamUrls(input.url);

        // Step 2: Stream slicing & vertical cropping via FFmpeg
        jobEntity.status = 'slicing';
        jobEntity.progressPercent = 50;
        await dbService.saveJob(jobEntity);
        emitProgress(jobId, { status: 'slicing', progressPercent: 50 });

        const { outputPath, cleanup } = await ffmpegService.sliceStream({
          jobId,
          videoUrl,
          audioUrl,
          start: input.start,
          end: input.end,
          aspectRatio: input.aspectRatio
        });

        try {
          // Step 3: Upload to Cloudflare R2
          jobEntity.status = 'uploading';
          jobEntity.progressPercent = 80;
          await dbService.saveJob(jobEntity);
          emitProgress(jobId, { status: 'uploading', progressPercent: 80 });

          const r2Key = `clips/${jobId}.mp4`;
          const r2Url = await storageService.uploadClip(outputPath, r2Key);

          // Step 4: Complete
          jobEntity.status = 'completed';
          jobEntity.progressPercent = 100;
          jobEntity.r2Url = r2Url;
          jobEntity.completedAt = new Date().toISOString();
          await dbService.saveJob(jobEntity);
          emitProgress(jobId, { status: 'completed', progressPercent: 100, r2Url });
          logger.info(`Job completed successfully: ${jobId}`);
        } finally {
          // Ephemeral Disk Cleanup (RAII Guard)
          await cleanup();
        }
      } catch (pipelineErr: any) {
        logger.error(`Pipeline error for job=${jobId}: ${pipelineErr.message}`);
        jobEntity.status = 'failed';
        jobEntity.error = pipelineErr.message;
        await dbService.saveJob(jobEntity);
        emitProgress(jobId, { status: 'failed', error: pipelineErr.message });
      } finally {
        renderMutex.release(mutexKey);
      }
    })();

    return successResponse({
      jobId,
      status: 'queued',
      message: 'Render pipeline started. Stream progress via SSE.'
    });
  }

  public async getJob({ params }: { params: { id: string } }) {
    const job = await dbService.getJob(params.id);
    if (!job) {
      return errorResponse('Clip job not found', 'NOT_FOUND', 404);
    }
    return successResponse(job);
  }

  // Server-Sent Events (SSE) endpoint for real-time progress
  public streamProgress({ params }: { params: { id: string } }) {
    const { id } = params;

    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (data: any) => {
            const chunk = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(new TextEncoder().encode(chunk));
          };

          // Send initial state if available
          const initial = await dbService.getJob(id);
          if (initial) {
            send(initial);
            if (initial.status === 'completed' || initial.status === 'failed') {
              controller.close();
              return;
            }
          }

          // Register listener
          const listeners = progressSubscribers.get(id) || [];
          const callback = (data: any) => {
            send(data);
            if (data.status === 'completed' || data.status === 'failed') {
              controller.close();
              const curr = progressSubscribers.get(id) || [];
              progressSubscribers.set(id, curr.filter(cb => cb !== callback));
            }
          };

          listeners.push(callback);
          progressSubscribers.set(id, listeners);
        },
        cancel() {
          logger.debug(`SSE connection closed for job=${id}`);
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      }
    );
  }
}

export const clipController = new ClipController();
