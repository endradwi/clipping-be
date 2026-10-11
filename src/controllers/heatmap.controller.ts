import { ytdlpService } from '../services/ytdlp.service';
import { heatmapService } from '../services/heatmap.service';
import { storageService } from '../services/storage.service';
import { aiService } from '../services/ai.service';
import { AnalyzeUrlSchema, PresignUploadSchema, AnalyzeUploadSchema, VideoAnalysisResult } from '../models/heatmap.model';
import { successResponse, errorResponse } from '../views/response.view';
import { logger } from '../common/logger';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export class HeatmapController {
  // Analyze YouTube Video via telemetry heatmap
  public async analyzeVideo({ body }: { body: any }) {
    const parse = AnalyzeUrlSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid URL payload', 'VALIDATION_ERROR', 422);
    }

    const { url } = parse.data;

    try {
      // 1. Fetch metadata, heatmap curves, and spoken transcript
      const meta = await ytdlpService.extractMetadata(url);

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
  public async getPresignedUploadUrl({ body }: { body: any }) {
    const parse = PresignUploadSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid upload parameters', 'VALIDATION_ERROR', 422);
    }

    try {
      const { presignedUrl, publicUrl, key } = await storageService.createPresignedUploadUrl(
        parse.data.filename,
        parse.data.contentType
      );

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
  public async analyzeUploadedVideo({ body }: { body: any }) {
    const parse = AnalyzeUploadSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid uploaded video payload', 'VALIDATION_ERROR', 422);
    }

    const { r2Url, title, filename } = parse.data;
    const uploadId = crypto.randomUUID();
    const tempDir = join('/tmp', 'cheat-clip');
    await mkdir(tempDir, { recursive: true });
    const audioPath = join(tempDir, `audio_${uploadId}.mp3`);

    const ffprobePath = process.env.FFPROBE_PATH || '/root/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffprobe';
    const ffmpegPath = process.env.FFMPEG_PATH || '/root/.hermes/tools/ffmpeg-9.0.1-linux-x64/bin/ffmpeg';

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

      // 2. Extract tiny downsampled audio (16kHz mono mp3 ~2MB) for Whisper transcription
      const audioProc = Bun.spawn([
        ffmpegPath,
        '-y', '-hide_banner', '-loglevel', 'warning',
        '-ss', '0',
        '-t', String(duration),
        '-i', r2Url,
        '-vn', '-ar', '16000', '-ac', '1', '-ab', '48k',
        audioPath
      ], { stdout: 'pipe', stderr: 'pipe' });

      await audioProc.exited;

      // 3. Fast Groq Whisper LPU transcription with word/sentence timestamps
      const { segments } = await aiService.transcribeAudioWithSegments(audioPath);

      // Clean up audio immediately
      await unlink(audioPath).catch(() => {});

      // 4. Generate candidate clips from speech dialogue intervals
      const topClips = heatmapService.computeClipsFromTranscript(segments, duration, 30, 24);

      const result: VideoAnalysisResult = {
        videoId: uploadId,
        title: title || filename || 'Uploaded Video Clip',
        duration,
        channel: 'Direct Upload',
        thumbnail: '',
        heatmapPoints: [],
        topClips,
        transcript: segments,
        isUploadedVideo: true,
        directVideoUrl: r2Url
      };

      return successResponse(result);
    } catch (err: any) {
      await unlink(audioPath).catch(() => {});
      logger.error(`Analyze uploaded video failed for ${r2Url}: ${err.message}`);
      return errorResponse(err.message, 'ANALYZE_UPLOAD_ERROR');
    }
  }
}

export const heatmapController = new HeatmapController();
