import { RawHeatmapPoint, CandidateClip } from '../models/heatmap.model';

export class HeatmapService {
  // Pure mathematical retention peak calculation (RPI) - supports multi-batch extraction (up to 12 clips / 4 batches)
  public computeTopClips(
    heatmap: RawHeatmapPoint[],
    totalDuration: number,
    clipDuration: number = 30,
    maxClips: number = 12
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
        chosenClips.push({
          id: crypto.randomUUID(),
          rank: chosenClips.length + 1,
          start: Math.round(start),
          end: Math.round(end),
          duration: Math.round(end - start),
          score: peak.score,
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
        label: `Key Highlight #${i}`
      });
    }
    return clips;
  }
}

export const heatmapService = new HeatmapService();
