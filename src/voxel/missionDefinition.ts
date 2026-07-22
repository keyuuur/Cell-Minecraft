import type { PlaceableStructureId, Point3 } from '../types/game';

/** Canonical internal-structure order shared by the integrated mission contracts and runtime. */
export const MISSION_STRUCTURE_ORDER = [
  'nucleus',
  'ribosomes',
  'mitochondria',
  'chloroplasts',
  'centralVacuole',
] as const satisfies readonly PlaceableStructureId[];

/** Reachability-proven suggestions; broad-zone placement remains valid when the layout can finish. */
export const MISSION_RECOMMENDED_PREFAB_ANCHORS: Readonly<Record<PlaceableStructureId, Point3>> = {
  nucleus: { x: -3, y: 1, z: -5 },
  ribosomes: { x: -2, y: 1, z: -1 },
  mitochondria: { x: 1, y: 1, z: -1 },
  chloroplasts: { x: 2, y: 1, z: -5 },
  centralVacuole: { x: -1, y: 1, z: -4 },
};
