import { describe, expect, it } from 'vitest';
import { validateVoxelMissionSnapshot } from '../contracts/missionContracts';
import { createInitialVoxelMissionSnapshot } from '../voxel/missionRuntime';
import { createMissionWorld } from '../voxel/missionWorld';
import { advanceIntegratedMissionForTesting } from './integratedMissionTestTools';

describe('development-only integrated mission checkpoints', () => {
  it('advances through valid boundary, structure, hydration, drought, and recovery states', () => {
    let mission = createInitialVoxelMissionSnapshot();
    const scores: string[] = [];
    for (let step = 0; step < 5; step += 1) {
      mission = advanceIntegratedMissionForTesting(mission, 1_700_000_000_000 + step);
      expect(
        validateVoxelMissionSnapshot(mission, createMissionWorld(mission, true)),
        `checkpoint ${step + 1}`,
      ).toBe(true);
      scores.push(
        [
          mission.boundary.wallAnchors.length,
          Object.keys(mission.placements).length,
          mission.homeostasis.vacuoleHydratedObserved,
          mission.homeostasis.droughtObserved,
          Boolean(mission.stageTimestamps.stable),
        ].join(':'),
      );
    }
    expect(scores).toEqual([
      '6:0:false:false:false',
      '6:5:false:false:false',
      '6:5:true:false:false',
      '6:5:true:true:false',
      '6:5:true:true:true',
    ]);
  });
});
