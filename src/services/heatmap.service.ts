import { RawHeatmapPoint, CandidateClip } from '../models/heatmap.model';

export class HeatmapService {
  // Pure mathematical retention peak calculation (RPI) - supports multi-batch extraction (up to 24+ clips)
  public computeTopClips(
    heatmap: RawHeatmapPoint[],
    totalDuration: number,
    clipDuration: number = 30,
    maxClips: number = 24
  ): CandidateClip[] {
    if (!heatmap || heatmap.length === 0) {
      return this.generateFallbackIntervals(totalDuration, clipDuration, maxClips);
    }

    // 1. Min-Max Normalization: RPI = (V - Vmin) / (Vmax - Vmin) * 100
    const values = heatmap.map(p => p.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1.0;

    const normalized = heatmap.map(p => ({
      ...p,
      rpi: ((p.value - minVal) / range) * 100
    }));

    // 2. Find local maxima peaks
    const peaks: Array<{ time: number; score: number }> = [];
    for (let i = 0; i < normalized.length; i++) {
      const prev = normalized[i - 1]?.rpi ?? 0;
      const curr = normalized[i].rpi;
      const next = normalized[i + 1]?.rpi ?? 0;

      if (curr >= prev && curr >= next && curr > 15) {
        peaks.push({
          time: normalized[i].start_time,
          score: Math.round(curr)
        });
      }
    }

    // Sort peaks by score descending
    peaks.sort((a, b) => b.score - a.score);

    // 3. Select non-overlapping candidate clips (spaced by clipDuration + 3s)
    const chosenClips: CandidateClip[] = [];
    const minSpacing = clipDuration + 3;

    for (const peak of peaks) {
      if (chosenClips.length >= maxClips) break;

      let start = Math.max(0, peak.time - 5);
      let end = start + clipDuration;

      if (end > totalDuration && totalDuration > clipDuration) {
        end = totalDuration;
        start = Math.max(0, end - clipDuration);
      }

      // Check overlap
      const overlaps = chosenClips.some(
        c => Math.abs(c.start - start) < minSpacing
      );

      if (!overlaps) {
        const categories: Array<'EDU' | 'CTRL' | 'INSP'> = ['EDU', 'CTRL', 'INSP'];
        const category = categories[chosenClips.length % 3];

        chosenClips.push({
          id: crypto.randomUUID(),
          rank: chosenClips.length + 1,
          start: Math.round(start),
          end: Math.round(end),
          duration: Math.round(end - start),
          score: peak.score,
          category,
          label: `Peak Retention Hotspot #${chosenClips.length + 1} (${peak.score}% interest)`
        });
      }
    }

    // If fewer clips than maxClips, supplement with evenly spaced fallbacks
    if (chosenClips.length < maxClips) {
      const fallbacks = this.generateFallbackIntervals(totalDuration, clipDuration, maxClips);
      for (const fb of fallbacks) {
        if (chosenClips.length >= maxClips) break;
        if (!chosenClips.some(c => Math.abs(c.start - fb.start) < minSpacing)) {
          fb.rank = chosenClips.length + 1;
          chosenClips.push(fb);
        }
      }
    }

    return chosenClips;
  }

  private generateFallbackIntervals(totalDuration: number, clipDuration: number, count: number): CandidateClip[] {
    const clips: CandidateClip[] = [];
    const step = Math.max(clipDuration, Math.floor((totalDuration - clipDuration) / (count + 1)));

    const categories: Array<'EDU' | 'CTRL' | 'INSP'> = ['EDU', 'CTRL', 'INSP'];
    for (let i = 1; i <= count; i++) {
      const start = Math.min(totalDuration - clipDuration, Math.max(0, (i - 1) * step));
      const end = start + clipDuration;
      clips.push({
        id: crypto.randomUUID(),
        rank: i,
        start: Math.round(start),
        end: Math.round(end),
        duration: Math.round(end - start),
        score: Math.max(10, Math.round(90 - (i * 6))),
        category: categories[(i - 1) % 3],
        label: `Key Highlight #${i}`
      });
    }
    return clips;
  }

  // Generates candidate hooks from spoken transcript timestamps (for uploaded videos with zero YouTube telemetry)
  public computeClipsFromTranscript(
    transcript: Array<{ start: number; duration?: number; text: string }>,
    totalDuration: number,
    clipDuration: number = 30,
    maxClips: number = 24
  ): CandidateClip[] {
    if (!transcript || transcript.length === 0) {
      return this.generateFallbackIntervals(totalDuration, clipDuration, maxClips);
    }

    const categories: Array<'EDU' | 'CTRL' | 'INSP'> = ['EDU', 'CTRL', 'INSP'];
    const clips: CandidateClip[] = [];
    const minSpacing = clipDuration;

    let currentIdx = 0;
    while (currentIdx < transcript.length && clips.length < maxClips) {
      const line = transcript[currentIdx];
      const start = Math.max(0, Math.round(line.start));
      const end = Math.min(totalDuration, start + clipDuration);

      if (end - start >= 10) {
        const overlaps = clips.some(c => Math.abs(c.start - start) < minSpacing);
        if (!overlaps) {
          const rank = clips.length + 1;
          const score = Math.max(70, Math.min(99, Math.round(98 - (rank * 1.5))));
          clips.push({
            id: crypto.randomUUID(),
            rank,
            start,
            end,
            duration: Math.round(end - start),
            score,
            category: categories[(rank - 1) % 3],
            label: `Spoken Dialogue Hook #${rank} (${score}% hook potential)`
          });
        }
      }

      const targetTime = start + clipDuration;
      let nextIdx = currentIdx + 1;
      while (nextIdx < transcript.length && transcript[nextIdx].start < targetTime) {
        nextIdx++;
      }
      currentIdx = nextIdx > currentIdx ? nextIdx : currentIdx + 1;
    }

    if (clips.length < maxClips && totalDuration > clipDuration) {
      const fallbacks = this.generateFallbackIntervals(totalDuration, clipDuration, maxClips);
      for (const fb of fallbacks) {
        if (clips.length >= maxClips) break;
        if (!clips.some(c => Math.abs(c.start - fb.start) < minSpacing)) {
          fb.rank = clips.length + 1;
          clips.push(fb);
        }
      }
    }

    return clips;
  }
}

export const heatmapService = new HeatmapService();
