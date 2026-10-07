import { logger } from '../common/logger';
import { AppError } from '../common/errors';
import { join } from 'node:path';

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
  private cookiesPath: string;

  constructor() {
    this.ytDlpPath = process.env.YTDLP_PATH || '/opt/clipper/venv/bin/yt-dlp';
    this.cookiesPath = join(process.cwd(), 'cookies.txt');
  }

  private async getCookiesArg(): Promise<string[]> {
    if (await Bun.file(this.cookiesPath).exists()) {
      return ['--cookies', this.cookiesPath];
    }
    return [];
  }

  // Extract metadata and heatmap curves without downloading the video
  public async extractMetadata(url: string): Promise<YtDlpMetadata> {
    logger.info(`Fetching metadata & heatmap for: ${url}`);
    const cookiesArg = await this.getCookiesArg();

    const args = [
      this.ytDlpPath,
      '--skip-download',
      '--dump-json',
      '--no-warnings',
      '--socket-timeout', '15',
      ...cookiesArg,
      url
    ];

    const proc = Bun.spawn(args, {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const stdoutText = await new Response(proc.stdout).text();
    const stderrText = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !stdoutText.trim()) {
      logger.error(`yt-dlp error: ${stderrText}`);
      if (stderrText.includes("Sign in to confirm you're not a bot")) {
        throw new AppError(
          "YouTube bot detection triggered on server IP. Paste your YouTube cookies.txt in Settings ⚙️ to unlock this video.",
          403
        );
      }
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
    const cookiesArg = await this.getCookiesArg();
    const proc = Bun.spawn([
      this.ytDlpPath,
      '-g',
      '-f', 'best[ext=mp4]/best',
      '--no-warnings',
      ...cookiesArg,
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
      const cookiesArg = await this.getCookiesArg();
      const proc = Bun.spawn([
        this.ytDlpPath,
        '--skip-download',
        '--write-auto-sub',
        '--sub-lang', 'en,id',
        '--sub-format', 'vtt',
        '-o', outVttPath.replace(/\.vtt$/, ''),
        '--no-warnings',
        ...cookiesArg,
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
