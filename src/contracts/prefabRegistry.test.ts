import { describe, expect, it } from 'vitest';
import type { PlaceableStructureId, Point3 } from '../types/game';
import {
  MISSION_PREFAB_REGISTRY,
  PREFAB_CAMERA_CLEARANCE,
  validatePrefabCameraClearance,
} from './prefabRegistry';

const ids = Object.keys(MISSION_PREFAB_REGISTRY) as PlaceableStructureId[];

describe('prefab camera clearance', () => {
  it.each(ids)('rejects just-inside and accepts just-outside clearance for %s', (id) => {
    const anchor: Point3 = { x: 0, y: 1, z: 0 };
    const maximumX = Math.max(...MISSION_PREFAB_REGISTRY[id].occupiedOffsets.map((cell) => cell.x));
    const visualEdge = anchor.x + maximumX + 0.5;
    const clearance = PREFAB_CAMERA_CLEARANCE[id];
    expect(
      validatePrefabCameraClearance(id, anchor, {
        x: visualEdge + clearance - 0.01,
        y: 1,
        z: 0.5,
      }),
    ).toEqual({ valid: false, reason: 'camera-too-close' });
    expect(
      validatePrefabCameraClearance(id, anchor, {
        x: visualEdge + clearance + 0.01,
        y: 1,
        z: 0.5,
      }),
    ).toEqual({ valid: true });
  });
});
