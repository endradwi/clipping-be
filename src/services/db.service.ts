import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ClipJobEntity } from '../models/clip.model';
import { logger } from '../common/logger';

export class DbService {
  private supabase: SupabaseClient | null = null;
  private inMemoryJobs = new Map<string, ClipJobEntity>();

  constructor() {
    const url = process.env.PUBLIC_SUPABASE_URL;
    const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key);
      logger.info('Supabase database client initialized');
    } else {
      logger.warn('Supabase credentials missing, running in in-memory state mode');
    }
  }

  public async saveJob(job: ClipJobEntity): Promise<void> {
    this.inMemoryJobs.set(job.id, job);

    if (this.supabase) {
      try {
        await this.supabase.from('render_jobs').upsert({
          id: job.id,
          youtube_url: job.url,
          title: job.title,
          start_time: job.start,
          end_time: job.end,
          duration: job.duration,
          status: job.status,
          progress_percent: job.progressPercent,
          r2_url: job.r2Url,
          burn_subtitles: job.burnSubtitles,
          error_message: job.error,
          created_at: job.createdAt,
          completed_at: job.completedAt
        });
      } catch (err: any) {
        logger.debug(`Supabase upsert skipped (table might not exist yet): ${err.message}`);
      }
    }
  }

  public async getJob(id: string): Promise<ClipJobEntity | null> {
    if (this.inMemoryJobs.has(id)) {
      return this.inMemoryJobs.get(id)!;
    }

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('render_jobs')
          .select('*')
          .eq('id', id)
          .single();

        if (data && !error) {
          return {
            id: data.id,
            url: data.youtube_url,
            title: data.title,
            start: data.start_time,
            end: data.end_time,
            duration: data.duration,
            status: data.status,
            progressPercent: data.progress_percent,
            r2Url: data.r2_url,
            burnSubtitles: data.burn_subtitles,
            error: data.error_message,
            createdAt: data.created_at,
            completedAt: data.completed_at
          };
        }
      } catch {
        // Table not ready
      }
    }

    return null;
  }

  // Find previously rendered completed clip matching same video and time range
  public async findMatchingCompletedJob(url: string, start: number, end: number): Promise<ClipJobEntity | null> {
    for (const job of this.inMemoryJobs.values()) {
      if (
        job.url === url &&
        Math.abs(job.start - start) < 1 &&
        Math.abs(job.end - end) < 1 &&
        job.status === 'completed' &&
        job.r2Url
      ) {
        return job;
      }
    }

    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from('render_jobs')
          .select('*')
          .eq('youtube_url', url)
          .eq('status', 'completed')
          .gte('start_time', start - 1)
          .lte('start_time', start + 1)
          .maybeSingle();

        if (data && data.r2_url) {
          return {
            id: data.id,
            url: data.youtube_url,
            title: data.title,
            start: data.start_time,
            end: data.end_time,
            duration: data.duration,
            status: data.status,
            progressPercent: data.progress_percent,
            r2Url: data.r2_url,
            burnSubtitles: data.burn_subtitles,
            error: data.error_message,
            createdAt: data.created_at,
            completedAt: data.completed_at
          };
        }
      } catch {}
    }

    return null;
  }

  // Retrieve all finished clip history for a given video/URL
  public async getJobsByUrl(url: string): Promise<ClipJobEntity[]> {
    const results: ClipJobEntity[] = [];

    for (const job of this.inMemoryJobs.values()) {
      if (job.url === url && job.status === 'completed') {
        results.push(job);
      }
    }

    if (this.supabase) {
      try {
        const { data } = await this.supabase
          .from('render_jobs')
          .select('*')
          .eq('youtube_url', url)
          .eq('status', 'completed');

        if (data) {
          for (const row of data) {
            if (!results.some(r => r.id === row.id)) {
              results.push({
                id: row.id,
                url: row.youtube_url,
                title: row.title,
                start: row.start_time,
                end: row.end_time,
                duration: row.duration,
                status: row.status,
                progressPercent: row.progress_percent,
                r2Url: row.r2_url,
                burnSubtitles: row.burn_subtitles,
                error: row.error_message,
                createdAt: row.created_at,
                completedAt: row.completed_at
              });
            }
          }
        }
      } catch {}
    }

    return results;
  }
}

export const dbService = new DbService();
