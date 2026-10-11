import { logger } from '../common/logger';
import { AppError } from '../common/errors';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export interface SliceOptions {
  jobId: string;
  videoUrl: string;
  audioUrl?: string;
  start: number;
  end: number;
  aspectRatio?: '9:16' | '1:1' | '16:9' | '4:5';
  subtitlePath?: string | null;
  onProgress?: (percent: number) => void;
}

export class FFmpegService {
  private ffmpegPath: string;

  constructor() {
    this.ffmpegPath = process.env.FFMPEG_PATH || Bun.which('ffmpeg') || '/usr/bin/ffmpeg';
  }

  // Zero-Disk Stream Slicing & Vertical 9:16 Cropping
  // Ephemeral RAII pattern: cleans up temp dir on exit
  public async sliceStream(options: SliceOptions): Promise<{ outputPath: string; cleanup: () => Promise<void> }> {
    const { jobId, videoUrl, audioUrl, start, end, aspectRatio = '9:16', subtitlePath } = options;
    const duration = Math.max(1, end - start);
    const tempDir = join('/tmp', 'cheat-clip', jobId);

    await mkdir(tempDir, { recursive: true });
    const outputFilename = `clip_${jobId}.mp4`;
    const outputPath = join(tempDir, outputFilename);

    logger.info(`FFmpeg Slicing job=${jobId}: stream [${start}s -> ${end}s] (${duration}s) to ${outputPath}`);

    // Build video filter
    let videoFilter = 'crop=ih*(9/16):ih'; // default 9:16 center crop
    if (aspectRatio === '1:1') {
      videoFilter = 'crop=ih:ih';
    } else if (aspectRatio === '4:5') {
      videoFilter = 'crop=ih*(4/5):ih';
    } else if (aspectRatio === '16:9') {
      videoFilter = 'null';
    }

    if (subtitlePath && (await Bun.file(subtitlePath).exists())) {
      const escapedSub = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
      videoFilter += `,subtitles='${escapedSub}':force_style='FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3'`;
    }

    const ffmpegArgs = [
      this.ffmpegPath,
      '-y',
      '-hide_banner',
      '-loglevel', 'warning',
      '-ss', String(start),
      '-to', String(end),
      '-i', videoUrl
    ];

    if (audioUrl) {
      ffmpegArgs.push(
        '-ss', String(start),
        '-to', String(end),
        '-i', audioUrl,
        '-map', '0:v:0',
        '-map', '1:a:0'
      );
    }

    ffmpegArgs.push(
      '-vf', videoFilter,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      outputPath
    );

    const proc = Bun.spawn(ffmpegArgs, {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const stderrText = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !(await Bun.file(outputPath).exists())) {
      logger.error(`FFmpeg execution failed (code ${exitCode}): ${stderrText}`);
      await rm(tempDir, { recursive: true, force: true });
      throw new AppError(`FFmpeg slice failed: ${stderrText.slice(0, 200)}`, 500);
    }

    const cleanup = async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
        logger.info(`Ephemeral disk cleanup done for job=${jobId}`);
      } catch (err: any) {
        logger.warn(`Failed cleanup for ${tempDir}: ${err.message}`);
      }
    };

    return { outputPath, cleanup };
  }
}

export const ffmpegService = new FFmpegService();
