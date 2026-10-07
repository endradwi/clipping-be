import { logger } from '../common/logger';
import { AppError } from '../common/errors';
import { join } from 'node:path';
import type { TranscriptLine } from '../models/heatmap.model';

export interface YtDlpMetadata {
  id: string;
  title: string;
  duration: number;
  channel: string;
  thumbnail: string;
  heatmap: Array<{ start_time: number; end_time: number; value: number }>;
  transcript: TranscriptLine[];
}

export interface StreamUrls {
  videoUrl: string;
  audioUrl?: string;
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

  // Extract metadata, heatmap curves, and full spoken transcript
  public async extractMetadata(url: string): Promise<YtDlpMetadata> {
    logger.info(`Fetching metadata & heatmap for: ${url}`);
    const cookiesArg = await this.getCookiesArg();

    const args = [
      this.ytDlpPath,
      '--skip-download',
      '--dump-json',
      '--remote-components', 'ejs:github',
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
      const transcript = await this.extractTranscriptFromData(data);

      return {
        id: data.id,
        title: data.title || 'Untitled YouTube Video',
        duration: Number(data.duration) || 0,
        channel: data.uploader || data.channel || 'Unknown Channel',
        thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
        heatmap: Array.isArray(data.heatmap) ? data.heatmap : [],
        transcript
      };
    } catch (e: any) {
      throw new AppError(`Invalid JSON from yt-dlp: ${e.message}`, 500);
    }
  }

  private async extractTranscriptFromData(data: any): Promise<TranscriptLine[]> {
    const caps = data.subtitles || data.automatic_captions || {};
    const candidateLangs = ['id', 'en', ...Object.keys(caps)];
    const lines: TranscriptLine[] = [];

    for (const lang of candidateLangs) {
      const tracks = caps[lang];
      if (!Array.isArray(tracks)) continue;

      const json3Track = tracks.find((t: any) => t.ext === 'json3');
      if (json3Track && json3Track.url) {
        try {
          const res = await fetch(json3Track.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (!res.ok) continue;

          const timedtext: any = await res.json();
          const events = timedtext.events || [];

          for (const ev of events) {
            const segs = ev.segs || [];
            const text = segs.map((s: any) => s.utf8 || '').join('').trim();
            if (text && text !== '\n') {
              lines.push({
                start: Math.round((ev.tStartMs || 0) / 100) / 10,
                duration: Math.round((ev.dDurationMs || 0) / 100) / 10,
                text
              });
            }
          }

          if (lines.length > 0) {
            logger.info(`Extracted ${lines.length} transcript lines from language track '${lang}'`);
            return lines;
          }
        } catch (err: any) {
          logger.debug(`Could not parse caption track ${lang}: ${err.message}`);
        }
      }
    }

    return [];
  }

  // Get direct stream URLs for audio and video slicing
  public async getDirectStreamUrls(url: string): Promise<StreamUrls> {
    const cookiesArg = await this.getCookiesArg();
    const proc = Bun.spawn([
      this.ytDlpPath,
      '--remote-components', 'ejs:github',
      '-g',
      '--no-warnings',
      ...cookiesArg,
      url
    ], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const streamOut = await new Response(proc.stdout).text();
    const stderrOut = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !streamOut.trim()) {
      logger.error(`Failed to resolve stream: ${stderrOut}`);
      throw new AppError(`Could not resolve YouTube stream URL: ${stderrOut.slice(0, 150)}`, 500);
    }

    const lines = streamOut.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
    if (lines.length === 0) {
      throw new AppError('Empty stream URL list returned by extractor', 500);
    }

    return {
      videoUrl: lines[0],
      audioUrl: lines[1] || undefined
    };
  }
}

export const ytdlpService = new YtDlpService();
