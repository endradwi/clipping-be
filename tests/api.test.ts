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
});
