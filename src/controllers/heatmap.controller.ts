import { ytdlpService } from '../services/ytdlp.service';
import { heatmapService } from '../services/heatmap.service';
import { storageService } from '../services/storage.service';
import { aiService } from '../services/ai.service';
import { AnalyzeUrlSchema, PresignUploadSchema, AnalyzeUploadSchema, VideoAnalysisResult } from '../models/heatmap.model';
import { successResponse, errorResponse } from '../views/response.view';
import { logger } from '../common/logger';
import { alertService } from '../services/alert.service';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export class HeatmapController {
  // Analyze YouTube Video via telemetry heatmap
  public async analyzeVideo({ body, request }: { body: any; request?: Request }) {
    const parse = AnalyzeUrlSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid URL payload', 'VALIDATION_ERROR', 422);
    }

    const { url } = parse.data;
    const client = alertService.extractClientInfo(request);

    try {
      // 1. Fetch metadata, heatmap curves, and spoken transcript
      const meta = await ytdlpService.extractMetadata(url);

      // Notify spy alert
      alertService.notifyAnalyze(meta.title || url, meta.duration, client.ip, client.device);

      // 2. Compute up to 24 candidate clips (no restrictive 3-clip limits)
      const topClips = heatmapService.computeTopClips(meta.heatmap, meta.duration, 30, 24);

      const result: VideoAnalysisResult = {
        videoId: meta.id,
        title: meta.title,
        duration: meta.duration,
        channel: meta.channel,
        thumbnail: meta.thumbnail,
        heatmapPoints: meta.heatmap,
        topClips,
        transcript: meta.transcript || []
      };

      return successResponse(result);
    } catch (err: any) {
      logger.error(`Analyze failed for ${url}: ${err.message}`);
      return errorResponse(err.message, 'ANALYZE_ERROR');
    }
  }

  // Generate Presigned Upload URL for direct browser-to-R2 upload (zero VPS load)
  public async getPresignedUploadUrl({ body, request }: { body: any; request?: Request }) {
    const parse = PresignUploadSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid upload parameters', 'VALIDATION_ERROR', 422);
    }

    try {
      const { presignedUrl, publicUrl, key } = await storageService.createPresignedUploadUrl(
        parse.data.filename,
        parse.data.contentType
      );

      const client = alertService.extractClientInfo(request);
      alertService.notifyUpload(parse.data.filename, client.ip, client.device);

      return successResponse({
        presignedUrl,
        publicUrl,
        key
      });
    } catch (err: any) {
      logger.error(`Presign upload failed: ${err.message}`);
      return errorResponse(err.message, 'UPLOAD_PRESIGN_ERROR');
    }
  }

  // Fallback direct upload through API (in case Cloudflare R2 bucket CORS is not configured)
  public async uploadDirectFallback({ request }: { request: Request }) {
    try {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return errorResponse('No file provided in form data', 'VALIDATION_ERROR', 400);
      }

      const filename = file.name || 'uploaded_video.mp4';
      const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `uploads/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${cleanName}`;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const publicUrl = await storageService.uploadBuffer(bytes, key, file.type || 'video/mp4');

      return successResponse({
        publicUrl,
        key
      });
    } catch (err: any) {
      logger.error(`Direct fallback upload failed: ${err.message}`);
      return errorResponse(err.message, 'FALLBACK_UPLOAD_ERROR');
    }
  }

  // Analyze directly uploaded video from R2 URL (stream probe + audio Whisper)
  public async analyzeUploadedVideo({ body, request }: { body: any; request?: Request }) {
    const parse = AnalyzeUploadSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid uploaded video payload', 'VALIDATION_ERROR', 422);
    }

    const { r2Url, title, filename } = parse.data;
    const client = alertService.extractClientInfo(request);
    const uploadId = crypto.randomUUID();
    const tempDir = join('/tmp', 'cheat-clip');
    await mkdir(tempDir, { recursive: true });
    const audioPath = join(tempDir, `audio_${uploadId}.mp3`);

    const ffprobePath = process.env.FFPROBE_PATH || (await Bun.which('ffprobe')) || '/usr/bin/ffprobe';
    const ffmpegPath = process.env.FFMPEG_PATH || (await Bun.which('ffmpeg')) || '/usr/bin/ffmpeg';

    try {
      logger.info(`Analyzing uploaded video from R2 stream: ${r2Url}`);

      // 1. Probe duration from HTTP stream
      const probeProc = Bun.spawn([
        ffprobePath,
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'json',
        r2Url
      ], { stdout: 'pipe', stderr: 'pipe' });

      const probeText = await new Response(probeProc.stdout).text();
      await probeProc.exited;
      const probeData = JSON.parse(probeText || '{}');
      const duration = Math.max(10, Math.round(Number(probeData.format?.duration || 60)));

      alertService.notifyAnalyze(title || filename || 'Uploaded Video', duration, client.ip, client.device);

      // 2. Extract downsampled audio (16kHz mono mp3) - single pass up to 90 mins (~14MB, well under Groq 25MB cap)
      const CHUNK_SEC = 5400; // 90 minutes per chunk
      const allSegments: Array<{ start: number; duration: number; text: string }> = [];

      if (duration <= CHUNK_SEC) {
        // Blazing fast single-pass extraction for videos up to 1.5 hours
        const audioPath = join(tempDir, `audio_${uploadId}_0.mp3`);
        const audioProc = Bun.spawn([
          ffmpegPath,
          '-y', '-hide_banner', '-loglevel', 'warning',
          '-ss', '0',
          '-t', String(duration),
          '-i', r2Url,
          '-vn', '-map', '0:a:0?', '-ar', '16000', '-ac', '1', '-ab', '32k',
          audioPath
        ], { stdout: 'pipe', stderr: 'pipe' });
        await audioProc.exited;

        const { segments } = await aiService.transcribeAudioWithSegments(audioPath, 0);
        await unlink(audioPath).catch(() => {});
        allSegments.push(...segments);
      } else {
        // High-scale chunking for massive 2h+ VODs
        const numChunks = Math.ceil(duration / CHUNK_SEC);
        logger.info(`Ultra long video detected (${Math.round(duration / 60)} mins). Processing ${numChunks} chunks sequentially...`);

        for (let i = 0; i < numChunks; i++) {
          const chunkStart = i * CHUNK_SEC;
          const chunkDur = Math.min(CHUNK_SEC, duration - chunkStart);
          const chunkAudioPath = join(tempDir, `audio_${uploadId}_${i}.mp3`);

          logger.info(`Extracting audio chunk ${i + 1}/${numChunks} [${chunkStart}s - ${chunkStart + chunkDur}s]`);
          const audioProc = Bun.spawn([
            ffmpegPath,
            '-y', '-hide_banner', '-loglevel', 'warning',
            '-ss', String(chunkStart),
            '-t', String(chunkDur),
            '-i', r2Url,
            '-vn', '-map', '0:a:0?', '-ar', '16000', '-ac', '1', '-ab', '32k',
            chunkAudioPath
          ], { stdout: 'pipe', stderr: 'pipe' });
          await audioProc.exited;

          const { segments } = await aiService.transcribeAudioWithSegments(chunkAudioPath, chunkStart);
          await unlink(chunkAudioPath).catch(() => {});
          allSegments.push(...segments);
        }
      }

      // 3. Generate candidate clips across entire duration from speech dialogue intervals
      const topClips = heatmapService.computeClipsFromTranscript(allSegments, duration, 30, 24);

      const result: VideoAnalysisResult = {
        videoId: uploadId,
        title: title || filename || 'Uploaded Video Clip',
        duration,
        channel: 'Direct Upload',
        thumbnail: '',
        heatmapPoints: [],
        topClips,
        transcript: allSegments,
        isUploadedVideo: true,
        directVideoUrl: r2Url
      };

      return successResponse(result);
    } catch (err: any) {
      logger.error(`Analyze uploaded video failed for ${r2Url}: ${err.message}`);
      return errorResponse(err.message, 'ANALYZE_UPLOAD_ERROR');
    }
  }
}

export const heatmapController = new HeatmapController();
