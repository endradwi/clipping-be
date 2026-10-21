import { z } from 'zod';

export const AnalyzeUrlSchema = z.object({
  url: z.string().url({ message: 'Valid YouTube URL required' }),
  brief: z.string().optional()
});

export const PresignUploadSchema = z.object({
  filename: z.string().min(1, { message: 'Filename required' }),
  contentType: z.string().optional().default('video/mp4'),
  // ponytail: 2GB hard limit on presigned upload. Add multipart chunking when supporting >2GB raw cinema files.
  size: z.number().max(2 * 1024 * 1024 * 1024, { message: 'Ukuran file maksimal 2 GB' }).optional()
});

export const AnalyzeUploadSchema = z.object({
  r2Url: z.string().url({ message: 'Valid R2 video URL required' }),
  title: z.string().optional(),
  filename: z.string().optional(),
  brief: z.string().optional()
});

export type AnalyzeUrlInput = z.infer<typeof AnalyzeUrlSchema>;

export interface RawHeatmapPoint {
  start_time: number;
  end_time: number;
  value: number; // 0.0 to 1.0
}

export interface PlatformMetadata {
  title: string;
  caption: string;
  hashtags: string[];
  description?: string;
  hook?: string;
  tips?: string;
  callToAction?: string;
}

export interface ClipRecommendation {
  tiktok: PlatformMetadata;
  youtubeShorts: PlatformMetadata;
  instagramReels: PlatformMetadata;
  briefCompliance?: {
    matched: boolean;
    reason: string;
  };
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
  recommendation?: ClipRecommendation;
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
  brief?: string;
}
