import type { PlaceableStructureId, Point3 } from '../types/game';
import { TARGET_RAYCAST_DISTANCE } from './raycastVoxel';

export const MISSION_WAYPOINT_REACHED_DISTANCE = 0.85;
export const MISSION_PLACEMENT_EYE_HEIGHT = 1.7;
const MISSION_FLOOR_TARGET_HEIGHT = 0.5;

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

/** Open student viewpoints kept within the five-block first-person placement reach. */
export const MISSION_PLACEMENT_VIEW_WAYPOINTS: Readonly<
  Record<Exclude<PlaceableStructureId, 'centralVacuole'>, Point3>
> = {
  nucleus: { x: -3, y: 1, z: -2 },
  ribosomes: { x: -3, y: 1, z: 1.2 },
  mitochondria: { x: 0, y: 1, z: 1.2 },
  chloroplasts: { x: 3, y: 1, z: -2 },
};

export const MISSION_CENTRAL_VACUOLE_SIDE_WAYPOINT: Readonly<Point3> = {
  x: 3,
  y: 1,
  z: -3,
};

/**
 * A placement viewpoint is complete only when the player is near the guide and
 * the intended floor target is still inside the real first-person ray reach.
 */
export function isMissionPlacementViewpointReached(
  player: Readonly<Point3>,
  waypoint: Readonly<Point3>,
  floorTarget?: Readonly<Point3>,
): boolean {
  if (
    Math.hypot(player.x - waypoint.x, player.z - waypoint.z) >
    MISSION_WAYPOINT_REACHED_DISTANCE + Number.EPSILON * 8
  ) {
    return false;
  }
  if (!floorTarget) return true;
  return (
    Math.hypot(
      floorTarget.x - player.x,
      MISSION_FLOOR_TARGET_HEIGHT - (player.y + MISSION_PLACEMENT_EYE_HEIGHT),
      floorTarget.z - player.z,
    ) <= TARGET_RAYCAST_DISTANCE
  );
}
