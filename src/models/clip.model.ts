import { z } from 'zod';

export const CreateClipSchema = z.object({
  url: z.string().url({ message: 'Must be a valid URL' }),
  start: z.number().min(0, { message: 'Start time must be >= 0' }),
  end: z.number().min(1, { message: 'End time must be > 0' }),
  aspectRatio: z.enum(['9:16', '1:1', '16:9']).default('9:16'),
  burnSubtitles: z.boolean().default(true),
  title: z.string().optional()
}).refine(data => data.end > data.start, {
  message: 'End time must be greater than start time',
  path: ['end']
}).refine(data => (data.end - data.start) <= 90, {
  message: 'Clip duration cannot exceed 90 seconds',
  path: ['end']
});

export type CreateClipInput = z.infer<typeof CreateClipSchema>;

export const ClipJobEntitySchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  title: z.string().optional(),
  start: z.number(),
  end: z.number(),
  duration: z.number(),
  status: z.enum(['queued', 'downloading', 'slicing', 'uploading', 'completed', 'failed']),
  progressPercent: z.number().min(0).max(100),
  burnSubtitles: z.boolean(),
  r2Url: z.string().url().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.string(),
  completedAt: z.string().nullable().optional()
});

export type ClipJobEntity = z.infer<typeof ClipJobEntitySchema>;
