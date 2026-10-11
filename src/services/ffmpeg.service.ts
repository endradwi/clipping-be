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
  layout?: 'single' | 'split' | 'fit-blur';
  panOffset?: number; // 0.0 (left/host) to 1.0 (right/guest), 0.5 = center
  subtitlePath?: string | null;
  hookTitle?: string;
  hookTitleTheme?: 'yellow' | 'red' | 'neon' | 'dark';
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
    const {
      jobId,
      videoUrl,
      audioUrl,
      start,
      end,
      aspectRatio = '9:16',
      layout = 'single',
      panOffset = 0.5,
      subtitlePath,
      hookTitle,
      hookTitleTheme = 'yellow'
    } = options;
    const duration = Math.max(1, end - start);
    const tempDir = join('/tmp', 'cheat-clip', jobId);

    await mkdir(tempDir, { recursive: true });
    const outputFilename = `clip_${jobId}.mp4`;
    const outputPath = join(tempDir, outputFilename);

    logger.info(`FFmpeg Slicing job=${jobId}: stream [${start}s -> ${end}s] (${duration}s) layout=${layout} pan=${panOffset} to ${outputPath}`);

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
        '-i', audioUrl
      );
    }

    const escapedSub = subtitlePath && (await Bun.file(subtitlePath).exists())
      ? subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:')
      : null;

    const subFilter = escapedSub
      ? `,subtitles='${escapedSub}':force_style='FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3'`
      : '';

    let hookFilter = '';
    if (hookTitle && hookTitle.trim().length > 0) {
      const cleanTitle = hookTitle.replace(/['":\\]/g, ' ').slice(0, 50).toUpperCase();
      const fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
      const boxColor = hookTitleTheme === 'red' ? 'red@0.9' : (hookTitleTheme === 'neon' ? '0xD4FF00@0.95' : (hookTitleTheme === 'dark' ? 'black@0.85' : 'yellow@0.95'));
      const fontColor = (hookTitleTheme === 'red' || hookTitleTheme === 'dark') ? 'white' : 'black';
      hookFilter = `,drawtext=fontfile=${fontPath}:text='${cleanTitle}':fontcolor=${fontColor}:fontsize=34:box=1:boxcolor=${boxColor}:boxborderw=12:x=(w-text_w)/2:y=100:enable='between(t,0,8)'`;
    }

    const offset = Math.max(0, Math.min(1, Number(panOffset) || 0.5));

    if (layout === 'split') {
      // Podcast Split-Screen: Stack Host (left crop) & Guest (right crop) top-to-bottom
      let filterComplex = `[0:v]split=2[v1][v2];[v1]crop=w=iw*0.55:h=ih:x=0:y=0,scale=1080:960[top];[v2]crop=w=iw*0.55:h=ih:x=in_w-out_w:y=0,scale=1080:960[bottom];[top][bottom]vstack=inputs=2${subFilter}${hookFilter}[v_out]`;
      ffmpegArgs.push(
        '-filter_complex', filterComplex,
        '-map', '[v_out]'
      );
    } else if (layout === 'fit-blur') {
      // Fit with Blurred Background (no crop, full view preserved)
      let filterComplex = `[0:v]split=2[fg][bg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg_blur];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg_scaled];[bg_blur][fg_scaled]overlay=(W-w)/2:(H-h)/2${subFilter}${hookFilter}[v_out]`;
      ffmpegArgs.push(
        '-filter_complex', filterComplex,
        '-map', '[v_out]'
      );
    } else {
      // Single Framing with dynamic horizontal pan offset (0.0=Host/Left, 0.5=Center, 1.0=Guest/Right)
      let videoFilter = `crop=w=ih*(9/16):h=ih:x=(in_w-out_w)*${offset}:y=0`;
      if (aspectRatio === '1:1') {
        videoFilter = `crop=w=ih:h=ih:x=(in_w-out_w)*${offset}:y=0`;
      } else if (aspectRatio === '4:5') {
        videoFilter = `crop=w=ih*(4/5):h=ih:x=(in_w-out_w)*${offset}:y=0`;
      } else if (aspectRatio === '16:9') {
        videoFilter = 'null';
      }
      videoFilter += subFilter + hookFilter;
      ffmpegArgs.push('-vf', videoFilter);
    }

    if (audioUrl) {
      ffmpegArgs.push('-map', '1:a:0?');
    } else {
      ffmpegArgs.push('-map', '0:a:0?');
    }

    ffmpegArgs.push(
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
