import { z } from 'zod';

export const SaveSettingsSchema = z.object({
  aiBaseUrl: z.string().url().optional(),
  aiApiKey: z.string().min(1).optional(),
  aiModel: z.string().min(1).optional(),
  groqApiKey: z.string().min(1).optional()
});

export type SaveSettingsInput = z.infer<typeof SaveSettingsSchema>;
