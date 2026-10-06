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
}

export const dbService = new DbService();
