import { describe, it, expect } from 'bun:test';
import { renderMutex } from '../src/common/mutex.guard';

describe('RenderMutexGuard (Anti-Double Click)', () => {
  it('should generate consistent SHA-256 idempotency key', () => {
    const key1 = renderMutex.generateKey('https://youtube.com/watch?v=abc', 10, 40);
    const key2 = renderMutex.generateKey('https://youtube.com/watch?v=abc', 10, 40);
    const key3 = renderMutex.generateKey('https://youtube.com/watch?v=abc', 15, 45);

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('should acquire lock and throw ConflictError on duplicate concurrent acquire', () => {
    const key = renderMutex.generateKey('https://youtube.com/watch?v=test', 0, 30);
    const jobId1 = 'job-1';
    const jobId2 = 'job-2';

    renderMutex.acquire(key, jobId1);
    expect(renderMutex.isLocked(key)).toBe(true);

    // Second acquire must throw ConflictError
    expect(() => renderMutex.acquire(key, jobId2)).toThrow();

    // Release allows acquiring again
    renderMutex.release(key);
    expect(renderMutex.isLocked(key)).toBe(false);

    expect(() => renderMutex.acquire(key, jobId2)).not.toThrow();
    renderMutex.release(key);
  });
});
