import { describe, it, expect } from 'bun:test';
import { app } from '../src/index';

describe('Elysia API Endpoints', () => {
  it('GET /health returns healthy status', async () => {
    const res = await app.handle(new Request('http://localhost:3000/health'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('clipping-be');
  });

  it('GET /api/v1/settings returns configuration state', async () => {
    const res = await app.handle(new Request('http://localhost:3000/api/v1/settings'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.activeRouterUrl).toBeDefined();
  });

  it('POST /api/v1/clips/render returns validation error on invalid input', async () => {
    const res = await app.handle(new Request('http://localhost:3000/api/v1/clips/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'invalid-url', start: 50, end: 10 })
    }));
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/upload/presign returns presigned upload credentials', async () => {
    const res = await app.handle(new Request('http://localhost:3000/api/v1/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test_podcast.mp4', contentType: 'video/mp4' })
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.data.presignedUrl).toBeDefined();
    expect(data.data.publicUrl).toBeDefined();
    expect(data.data.key).toContain('test_podcast.mp4');
  });

  it('GET /api/v1/clips/history returns list of rendered clips', async () => {
    const res = await app.handle(new Request('http://localhost:3000/api/v1/clips/history?url=https://youtube.com/watch?v=demo123'));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('POST /api/v1/clips/recommendation generates tailored metadata for TikTok, Shorts, and Reels', async () => {
    const res = await app.handle(new Request('http://localhost:3000/api/v1/clips/recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcriptSnippet: 'Kunci sukses affiliate marketing adalah konsistensi dan paham algoritma platform.',
        brief: 'Wajib sertakan hashtag #ClipperPro dan fokus tips bisnis.',
        videoTitle: 'Cara Sukses Affiliate 2026'
      })
    }));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.data.tiktok).toBeDefined();
    expect(data.data.tiktok.hashtags.length).toBeGreaterThan(0);
    expect(data.data.youtubeShorts).toBeDefined();
    expect(data.data.youtubeShorts.title.length).toBeLessThanOrEqual(50);
    expect(data.data.instagramReels).toBeDefined();
    expect(data.data.briefCompliance).toBeDefined();
  }, 10000);

  it('POST /api/v1/clips/recommendation returns validation error when transcript is missing', async () => {
    const res = await app.handle(new Request('http://localhost:3000/api/v1/clips/recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: 'Some brief' })
    }));
    const data = await res.json() as any;
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/v1/media/stream returns 400 when url parameter is missing', async () => {
    const res = await app.handle(new Request('http://localhost:3000/api/v1/media/stream'));
    expect(res.status).toBe(400);
  });
});
