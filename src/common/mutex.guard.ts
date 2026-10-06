import { ConflictError } from './errors';

// In-memory mutex tracker to prevent duplicate concurrent rendering of same slice
// Idempotency Hash: sha256(url + start + end)
class RenderMutexGuard {
  private activeJobs = new Map<string, { jobId: string; startedAt: number }>();

  public generateKey(url: string, start: number, end: number): string {
    const raw = `${url.trim().toLowerCase()}_${start.toFixed(1)}_${end.toFixed(1)}`;
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(raw);
    return hasher.digest('hex');
  }

  public acquire(key: string, jobId: string): void {
    const existing = this.activeJobs.get(key);
    if (existing) {
      // If job is younger than 10 minutes, lock it
      if (Date.now() - existing.startedAt < 10 * 60 * 1000) {
        throw new ConflictError(
          `Render job for this video slice is already in progress (${existing.jobId}). Avoid double execution.`
        );
      }
    }
    this.activeJobs.set(key, { jobId, startedAt: Date.now() });
  }

  public release(key: string): void {
    this.activeJobs.delete(key);
  }

  public isLocked(key: string): boolean {
    return this.activeJobs.has(key);
  }
}

export const renderMutex = new RenderMutexGuard();
