import type { MissionRuntimePresentation } from './missionPresentation';

export const MISSION_PERFORMANCE_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;
export const MISSION_PERFORMANCE_BRIDGE_KEY = '__BUILD_CELL_PERFORMANCE__' as const;

export interface PerformanceRollupV1 {
  samples: number;
  medianMs: number;
  p95Ms: number;
  maximumMs: number;
}

export interface MissionPerformanceDiagnosticsV1 {
  schemaVersion: typeof MISSION_PERFORMANCE_DIAGNOSTICS_SCHEMA_VERSION;
  quality: MissionRuntimePresentation['quality'];
  effectiveReducedMotion: boolean;
  instrumentationReady: boolean;
  instrumentationError: boolean;
  marks: {
    firstRenderedFrameMs: number | null;
  };
  render: {
    width: number;
    height: number;
    hardwareScalingLevel: number;
    loopActive: boolean;
    frameOrdinal: number;
    frameTimes: PerformanceRollupV1;
    renderTimes: PerformanceRollupV1;
    drawCalls: number;
    activeMeshes: number;
    totalMeshes: number;
    totalVertices: number;
    materials: number;
    textures: number;
  };
  assets: {
    requests: number;
    failures: number;
    pendingLoads: number;
    activeInstances: number;
  };
  overview: {
    staticFrameCount: number;
    lastStaticFrameDurationMs: number | null;
    lastOverviewFrameDurationMs: number | null;
  };
}

export interface MissionPerformanceDiagnosticsBridge {
  read: () => MissionPerformanceDiagnosticsV1 | null;
}

export interface MissionPerformanceReadInput {
  instrumentationReady: boolean;
  instrumentationError: boolean;
  renderWidth: number;
  renderHeight: number;
  hardwareScalingLevel: number;
  renderLoopActive: boolean;
  drawCalls: number;
  activeMeshes: number;
  totalMeshes: number;
  totalVertices: number;
  materials: number;
  textures: number;
  assetRequests: number;
  assetFailures: number;
  pendingAssetLoads: number;
  activeAssetInstances: number;
}

const EMPTY_ROLLUP: PerformanceRollupV1 = {
  samples: 0,
  medianMs: 0,
  p95Ms: 0,
  maximumMs: 0,
};

function rounded(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function percentile(values: readonly number[], percentileRank: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.min(1, percentileRank));
  const index = Math.ceil(rank * ordered.length) - 1;
  return ordered[Math.max(0, index)] ?? 0;
}

export class BoundedPerformanceSamples {
  private readonly values: number[] = [];

  constructor(private readonly maximumSamples = 180) {
    if (!Number.isInteger(maximumSamples) || maximumSamples <= 0) {
      throw new Error('PERFORMANCE_SAMPLE_LIMIT_INVALID');
    }
  }

  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.values.push(value);
    if (this.values.length > this.maximumSamples) this.values.shift();
  }

  clear(): void {
    this.values.length = 0;
  }

  rollup(): PerformanceRollupV1 {
    if (this.values.length === 0) return { ...EMPTY_ROLLUP };
    return {
      samples: this.values.length,
      medianMs: rounded(percentile(this.values, 0.5)),
      p95Ms: rounded(percentile(this.values, 0.95)),
      maximumMs: rounded(Math.max(...this.values)),
    };
  }
}

export class MissionPerformanceRecorder {
  private readonly startedAt: number;
  private readonly frameTimes = new BoundedPerformanceSamples();
  private readonly renderTimes = new BoundedPerformanceSamples();
  private lastFrameStartedAt: number | null = null;
  private firstRenderedFrameMs: number | null = null;
  private frameOrdinal = 0;
  private staticFrameCount = 0;
  private lastStaticFrameDurationMs: number | null = null;
  private lastOverviewFrameDurationMs: number | null = null;

  constructor(
    private readonly presentation: MissionRuntimePresentation,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.startedAt = now();
  }

  private elapsed(at = this.now()): number {
    return rounded(Math.max(0, at - this.startedAt));
  }

  resetAnimatedFrameBaseline(): void {
    this.lastFrameStartedAt = null;
  }

  recordFrame(
    startedAt: number,
    finishedAt: number,
    staticFrame: boolean,
    overview: boolean,
  ): void {
    const duration = Math.max(0, finishedAt - startedAt);
    if (this.lastFrameStartedAt !== null && !staticFrame) {
      this.frameTimes.add(Math.max(0, startedAt - this.lastFrameStartedAt));
    }
    if (!staticFrame) this.lastFrameStartedAt = startedAt;
    this.renderTimes.add(duration);
    this.frameOrdinal += 1;
    if (this.firstRenderedFrameMs === null) this.firstRenderedFrameMs = this.elapsed(finishedAt);
    if (staticFrame) {
      this.staticFrameCount += 1;
      this.lastStaticFrameDurationMs = rounded(duration);
      if (overview) this.lastOverviewFrameDurationMs = rounded(duration);
    }
  }

  snapshot(input: MissionPerformanceReadInput): MissionPerformanceDiagnosticsV1 {
    return {
      schemaVersion: MISSION_PERFORMANCE_DIAGNOSTICS_SCHEMA_VERSION,
      quality: this.presentation.quality,
      effectiveReducedMotion: this.presentation.effectiveReducedMotion,
      instrumentationReady: input.instrumentationReady,
      instrumentationError: input.instrumentationError,
      marks: {
        firstRenderedFrameMs: this.firstRenderedFrameMs,
      },
      render: {
        width: input.renderWidth,
        height: input.renderHeight,
        hardwareScalingLevel: rounded(input.hardwareScalingLevel),
        loopActive: input.renderLoopActive,
        frameOrdinal: this.frameOrdinal,
        frameTimes: this.frameTimes.rollup(),
        renderTimes: this.renderTimes.rollup(),
        drawCalls: Math.max(0, Math.round(input.drawCalls)),
        activeMeshes: Math.max(0, Math.round(input.activeMeshes)),
        totalMeshes: Math.max(0, Math.round(input.totalMeshes)),
        totalVertices: Math.max(0, Math.round(input.totalVertices)),
        materials: Math.max(0, Math.round(input.materials)),
        textures: Math.max(0, Math.round(input.textures)),
      },
      assets: {
        requests: Math.max(0, Math.round(input.assetRequests)),
        failures: Math.max(0, Math.round(input.assetFailures)),
        pendingLoads: Math.max(0, Math.round(input.pendingAssetLoads)),
        activeInstances: Math.max(0, Math.round(input.activeAssetInstances)),
      },
      overview: {
        staticFrameCount: this.staticFrameCount,
        lastStaticFrameDurationMs: this.lastStaticFrameDurationMs,
        lastOverviewFrameDurationMs: this.lastOverviewFrameDurationMs,
      },
    };
  }

  dispose(): void {
    this.frameTimes.clear();
    this.renderTimes.clear();
    this.lastFrameStartedAt = null;
  }
}
