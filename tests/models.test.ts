import { describe, it, expect } from 'bun:test';
import { CreateClipSchema } from '../src/models/clip.model';
import { AnalyzeUrlSchema } from '../src/models/heatmap.model';

describe('Zod Validation Schemas', () => {
  it('should validate correct clip creation payload', () => {
    const valid = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      start: 10,
      end: 40,
      aspectRatio: '9:16',
      burnSubtitles: true
    };
    const res = CreateClipSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it('should reject clip when end <= start', () => {
    const invalid = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      start: 40,
      end: 10
    };
    const res = CreateClipSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('should reject clip when duration > 90s', () => {
    const invalid = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      start: 0,
      end: 100
    };
    const res = CreateClipSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it('should reject invalid YouTube URL', () => {
    const invalid = { url: 'not-a-valid-url' };
    const res = AnalyzeUrlSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });
});
