import { ytdlpService } from '../services/ytdlp.service';
import { heatmapService } from '../services/heatmap.service';
import { AnalyzeUrlSchema, VideoAnalysisResult } from '../models/heatmap.model';
import { successResponse, errorResponse } from '../views/response.view';
import { logger } from '../common/logger';

export class HeatmapController {
  public async analyzeVideo({ body }: { body: any }) {
    const parse = AnalyzeUrlSchema.safeParse(body);
    if (!parse.success) {
      return errorResponse(parse.error.errors[0]?.message || 'Invalid URL payload', 'VALIDATION_ERROR', 422);
    }

    const { url } = parse.data;

    try {
      // 1. Fetch metadata, heatmap curves, and spoken transcript
      const meta = await ytdlpService.extractMetadata(url);

      // 2. Compute Top 3 retention peaks using mathematical RPI (Anti-Slop)
      const topClips = heatmapService.computeTopClips(meta.heatmap, meta.duration, 30, 3);

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
}

export const heatmapController = new HeatmapController();
