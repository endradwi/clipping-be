import { z } from 'zod';

export const AnalyzeUrlSchema = z.object({
  url: z.string().url({ message: 'Valid YouTube URL required' })
});

export type AnalyzeUrlInput = z.infer<typeof AnalyzeUrlSchema>;

export interface RawHeatmapPoint {
  start_time: number;
  end_time: number;
  value: number; // 0.0 to 1.0
}

export interface CandidateClip {
  id: string; // uuid
  rank: number; // 1, 2, 3
  start: number;
  end: number;
  duration: number;
  score: number; // RPI (0 - 100)
  label: string;
}

export interface VideoAnalysisResult {
  videoId: string;
  title: string;
  duration: number;
  channel: string;
  thumbnail: string;
  heatmapPoints: RawHeatmapPoint[];
  topClips: CandidateClip[];
}
