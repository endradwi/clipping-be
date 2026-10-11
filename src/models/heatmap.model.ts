import { z } from 'zod';

export const AnalyzeUrlSchema = z.object({
  url: z.string().url({ message: 'Valid YouTube URL required' })
});

export const PresignUploadSchema = z.object({
  filename: z.string().min(1, { message: 'Filename required' }),
  contentType: z.string().optional().default('video/mp4'),
  size: z.number().optional()
});

export const AnalyzeUploadSchema = z.object({
  r2Url: z.string().url({ message: 'Valid R2 video URL required' }),
  title: z.string().optional(),
  filename: z.string().optional()
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
  category?: 'EDU' | 'CTRL' | 'INSP';
}

export interface TranscriptLine {
  start: number;
  duration: number;
  text: string;
}

export interface VideoAnalysisResult {
  videoId: string;
  title: string;
  duration: number;
  channel: string;
  thumbnail: string;
  heatmapPoints: RawHeatmapPoint[];
  topClips: CandidateClip[];
  transcript: TranscriptLine[];
  isUploadedVideo?: boolean;
  directVideoUrl?: string;
}
