import { logger } from '../common/logger';
import { AppError } from '../common/errors';

export interface YtDlpMetadata {
  id: string;
  title: string;
  duration: number;
  channel: string;
  thumbnail: string;
  heatmap: Array<{ start_time: number; end_time: number; value: number }>;
}

export class YtDlpService {
  private ytDlpPath: string;

  constructor() {
    this.ytDlpPath = process.env.YTDLP_PATH || '/opt/clipper/venv/bin/yt-dlp';
  }

  // Extract metadata and heatmap curves without downloading the video
  public async extractMetadata(url: string): Promise<YtDlpMetadata> {
    logger.info(`Fetching metadata & heatmap for: ${url}`);
    const proc = Bun.spawn([
      this.ytDlpPath,
      '--skip-download',
      '--dump-json',
      '--no-warnings',
      '--socket-timeout', '15',
      url
    ], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const stdoutText = await new Response(proc.stdout).text();
    const stderrText = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !stdoutText.trim()) {
      logger.error(`yt-dlp error: ${stderrText}`);
      throw new AppError(`Failed to fetch YouTube metadata: ${stderrText.slice(0, 200)}`, 400);
    }

    try {
      const data = JSON.parse(stdoutText);
      return {
        id: data.id,
        title: data.title || 'Untitled YouTube Video',
        duration: Number(data.duration) || 0,
        channel: data.uploader || data.channel || 'Unknown Channel',
        thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
        heatmap: Array.isArray(data.heatmap) ? data.heatmap : []
      };
    } catch (e: any) {
      throw new AppError(`Invalid JSON from yt-dlp: ${e.message}`, 500);
    }
  }

  // Get direct stream URL for audio/video slicing
  public async getDirectStreamUrl(url: string): Promise<string> {
    const proc = Bun.spawn([
      this.ytDlpPath,
      '-g',
      '-f', 'best[ext=mp4]/best',
      '--no-warnings',
      url
    ], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const streamOut = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !streamOut.trim()) {
      throw new AppError('Could not resolve direct YouTube stream URL for slicing', 500);
    }

    return streamOut.trim().split('\n')[0];
  }

  // Extract native auto-subtitles if available (0 CPU, 0 cost)
  public async extractNativeSubtitles(url: string, outVttPath: string): Promise<boolean> {
    try {
      const proc = Bun.spawn([
        this.ytDlpPath,
        '--skip-download',
        '--write-auto-sub',
        '--sub-lang', 'en,id',
        '--sub-format', 'vtt',
        '-o', outVttPath.replace(/\.vtt$/, ''),
        '--no-warnings',
        url
      ], {
        stdout: 'pipe',
        stderr: 'pipe'
      });
      await proc.exited;
      return await Bun.file(outVttPath).exists();
    } catch {
      return false;
    }
  }
}

export const ytdlpService = new YtDlpService();
