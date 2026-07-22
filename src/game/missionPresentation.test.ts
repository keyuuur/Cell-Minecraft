import { describe, expect, it } from 'vitest';
import { resolveMissionPresentation, resolveMissionQuality } from './missionPresentation';

describe('mission runtime presentation', () => {
  it('uses a deterministic constrained-device fallback for Auto quality', () => {
    expect(resolveMissionQuality('auto', { hardwareConcurrency: 4 })).toBe('low');
    expect(resolveMissionQuality('auto', { deviceMemory: 4, hardwareConcurrency: 8 })).toBe('low');
    expect(resolveMissionQuality('auto', { deviceMemory: 8, hardwareConcurrency: 8 })).toBe(
      'standard',
    );
    expect(resolveMissionQuality('standard', { deviceMemory: 2, hardwareConcurrency: 2 })).toBe(
      'standard',
    );
  });

  it('never lets an in-app false setting override reduced motion from the operating system', () => {
    const presentation = resolveMissionPresentation('standard', false, {
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      osReducedMotion: true,
    });
    expect(presentation.effectiveReducedMotion).toBe(true);
  });

  it('gives Low mode a lower-cost render resolution than Standard mode', () => {
    const capabilities = {
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      osReducedMotion: false,
    };
    const low = resolveMissionPresentation('low', false, capabilities);
    const standard = resolveMissionPresentation('standard', false, capabilities);
    expect(low.hardwareScalingLevel).toBeGreaterThan(standard.hardwareScalingLevel);
    expect(low.quality).toBe('low');
    expect(standard.quality).toBe('standard');
  });
});
