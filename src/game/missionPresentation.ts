import type { QualityMode } from '../types/game';

export interface MissionPresentationCapabilities {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  devicePixelRatio: number;
  osReducedMotion: boolean;
}

export interface MissionRuntimePresentation {
  effectiveReducedMotion: boolean;
  quality: Exclude<QualityMode, 'auto'>;
  hardwareScalingLevel: number;
}

function finitePositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function resolveMissionQuality(
  requested: QualityMode,
  capabilities: Pick<MissionPresentationCapabilities, 'deviceMemory' | 'hardwareConcurrency'>,
): Exclude<QualityMode, 'auto'> {
  if (requested !== 'auto') return requested;
  const memoryConstrained =
    finitePositive(capabilities.deviceMemory) && capabilities.deviceMemory <= 4;
  const processorConstrained =
    finitePositive(capabilities.hardwareConcurrency) && capabilities.hardwareConcurrency <= 4;
  return memoryConstrained || processorConstrained ? 'low' : 'standard';
}

export function resolveMissionPresentation(
  requestedQuality: QualityMode,
  inAppReducedMotion: boolean | undefined,
  capabilities: MissionPresentationCapabilities,
): MissionRuntimePresentation {
  const quality = resolveMissionQuality(requestedQuality, capabilities);
  const ratio = Math.max(1, capabilities.devicePixelRatio || 1);
  return {
    effectiveReducedMotion: Boolean(inAppReducedMotion) || capabilities.osReducedMotion,
    quality,
    hardwareScalingLevel: quality === 'low' ? Math.max(1.5, ratio) : Math.max(1, ratio / 1.5),
  };
}
