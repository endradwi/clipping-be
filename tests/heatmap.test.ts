import { describe, it, expect } from 'bun:test';
import { HeatmapService } from '../src/services/heatmap.service';
import type { RawHeatmapPoint } from '../src/models/heatmap.model';

describe('HeatmapService (RPI Mathematical Algorithm)', () => {
  const service = new HeatmapService();

  it('should extract top 3 non-overlapping peaks from real heatmap points', () => {
    // Simulated 100-point retention curve with 3 distinct peaks at t=10s, t=60s, t=120s
    const points: RawHeatmapPoint[] = Array.from({ length: 50 }, (_, i) => ({
      start_time: i * 3,
      end_time: (i + 1) * 3,
      value: 0.1
    }));

    // Inject peak 1 at t=12s (value 0.95)
    points[4].value = 0.95;
    // Inject peak 2 at t=60s (value 0.85)
    points[20].value = 0.85;
    // Inject peak 3 at t=120s (value 0.75)
    points[40].value = 0.75;

    const clips = service.computeTopClips(points, 150, 30, 3);

    expect(clips).toHaveLength(3);
    expect(clips[0].rank).toBe(1);
    expect(clips[1].rank).toBe(2);
    expect(clips[2].rank).toBe(3);

    // Verify non-overlapping: gap between starts >= duration
    expect(Math.abs(clips[0].start - clips[1].start)).toBeGreaterThanOrEqual(30);
    expect(Math.abs(clips[1].start - clips[2].start)).toBeGreaterThanOrEqual(30);

    // Verify RPI scores are calculated
    expect(clips[0].score).toBeGreaterThan(clips[1].score);
    expect(clips[1].score).toBeGreaterThan(clips[2].score);
  });

  it('should gracefully fallback to evenly spaced intervals when heatmap is empty', () => {
    const clips = service.computeTopClips([], 180, 30, 3);

    expect(clips).toHaveLength(3);
    expect(clips[0].duration).toBe(30);
    expect(clips[1].duration).toBe(30);
    expect(clips[2].duration).toBe(30);
    expect(clips[0].start).toBeLessThan(clips[1].start);
    expect(clips[1].start).toBeLessThan(clips[2].start);
  });
});
