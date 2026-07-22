import { describe, expect, it } from 'vitest';
import {
  BoundedPerformanceSamples,
  MissionPerformanceRecorder,
  percentile,
} from './missionPerformanceDiagnostics';

describe('mission performance diagnostics', () => {
  it('calculates deterministic nearest-rank percentiles', () => {
    expect(percentile([], 0.95)).toBe(0);
    expect(percentile([9, 1, 5, 3], 0.5)).toBe(3);
    expect(percentile([9, 1, 5, 3], 0.95)).toBe(9);
  });

  it('keeps only the newest bounded samples', () => {
    const samples = new BoundedPerformanceSamples(3);
    samples.add(1);
    samples.add(2);
    samples.add(3);
    samples.add(10);
    expect(samples.rollup()).toEqual({
      samples: 3,
      medianMs: 3,
      p95Ms: 10,
      maximumMs: 10,
    });
    samples.clear();
    expect(samples.rollup().samples).toBe(0);
  });

  it('records the first rendered frame and static Overview frames without identity data', () => {
    const now = 100;
    const recorder = new MissionPerformanceRecorder(
      { quality: 'low', effectiveReducedMotion: true, hardwareScalingLevel: 2 },
      () => now,
    );
    recorder.recordFrame(105, 107, false, false);
    recorder.recordFrame(121, 124, false, false);
    recorder.recordFrame(130, 131.25, true, true);

    const snapshot = recorder.snapshot({
      instrumentationReady: true,
      instrumentationError: false,
      renderWidth: 1024,
      renderHeight: 680,
      hardwareScalingLevel: 2,
      renderLoopActive: false,
      drawCalls: 12.4,
      activeMeshes: 10,
      totalMeshes: 14,
      totalVertices: 800,
      materials: 6,
      textures: 4,
      assetRequests: 0,
      assetFailures: 0,
      pendingAssetLoads: 0,
      activeAssetInstances: 0,
    });

    expect(snapshot.marks).toEqual({
      firstRenderedFrameMs: 7,
    });
    expect(snapshot.render.frameOrdinal).toBe(3);
    expect(snapshot.render.frameTimes).toMatchObject({ samples: 1, medianMs: 16 });
    expect(snapshot.render.drawCalls).toBe(12);
    expect(snapshot.overview).toEqual({
      staticFrameCount: 1,
      lastStaticFrameDurationMs: 1.25,
      lastOverviewFrameDurationMs: 1.25,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/attempt|session|student|firstName|lastInitial/i);
  });

  it('does not count a paused or static-view gap as an animated frame interval', () => {
    const recorder = new MissionPerformanceRecorder(
      { quality: 'standard', effectiveReducedMotion: false, hardwareScalingLevel: 1 },
      () => 0,
    );
    recorder.recordFrame(10, 12, false, false);
    recorder.recordFrame(26, 28, false, false);
    recorder.resetAnimatedFrameBaseline();
    recorder.recordFrame(5_000, 5_002, true, true);
    recorder.recordFrame(8_000, 8_002, false, false);
    recorder.recordFrame(8_016, 8_018, false, false);

    const snapshot = recorder.snapshot({
      instrumentationReady: true,
      instrumentationError: false,
      renderWidth: 1024,
      renderHeight: 768,
      hardwareScalingLevel: 1,
      renderLoopActive: true,
      drawCalls: 0,
      activeMeshes: 0,
      totalMeshes: 0,
      totalVertices: 0,
      materials: 0,
      textures: 0,
      assetRequests: 0,
      assetFailures: 0,
      pendingAssetLoads: 0,
      activeAssetInstances: 0,
    });

    expect(snapshot.render.frameTimes).toMatchObject({
      samples: 2,
      medianMs: 16,
      p95Ms: 16,
      maximumMs: 16,
    });
  });
});
