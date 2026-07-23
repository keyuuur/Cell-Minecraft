import { describe, expect, it } from 'vitest';
import { validatePrefabCameraClearance } from '../contracts/prefabRegistry';
import type { PlaceableStructureId } from '../types/game';
import {
  isMissionPlacementViewpointReached,
  MISSION_CENTRAL_VACUOLE_SIDE_WAYPOINT,
  MISSION_PLACEMENT_EYE_HEIGHT,
  MISSION_PLACEMENT_VIEW_WAYPOINTS,
  MISSION_RECOMMENDED_PREFAB_ANCHORS,
  MISSION_WAYPOINT_REACHED_DISTANCE,
} from './missionDefinition';
import { createInitialVoxelMissionSnapshot } from './missionRuntime';
import { createMissionWorld } from './missionWorld';
import { raycastVoxel, TARGET_RAYCAST_DISTANCE } from './raycastVoxel';

const PLACEMENT_REACH = 5;
const PLACEABLE_WITH_VIEWPOINT = [
  'nucleus',
  'ribosomes',
  'mitochondria',
  'chloroplasts',
] as const satisfies readonly Exclude<PlaceableStructureId, 'centralVacuole'>[];

describe('mission placement viewpoints', () => {
  it.each(PLACEABLE_WITH_VIEWPOINT)(
    'keeps the %s anchor within crosshair reach and camera clearance',
    (id) => {
      const viewpoint = MISSION_PLACEMENT_VIEW_WAYPOINTS[id];
      const anchor = MISSION_RECOMMENDED_PREFAB_ANCHORS[id];
      const eyeToFloorAnchor = Math.hypot(
        anchor.x - viewpoint.x,
        0.5 - (viewpoint.y + MISSION_PLACEMENT_EYE_HEIGHT),
        anchor.z - viewpoint.z,
      );

      expect(eyeToFloorAnchor).toBeLessThanOrEqual(PLACEMENT_REACH);
      expect(validatePrefabCameraClearance(id, anchor, viewpoint)).toEqual({ valid: true });
    },
  );

  it('keeps every staged recommended anchor as the first floor hit within reach', () => {
    const snapshot = createInitialVoxelMissionSnapshot();
    const sequence: readonly [PlaceableStructureId, { x: number; y: number; z: number }][] = [
      ['nucleus', MISSION_PLACEMENT_VIEW_WAYPOINTS.nucleus],
      ['ribosomes', MISSION_PLACEMENT_VIEW_WAYPOINTS.ribosomes],
      ['mitochondria', MISSION_PLACEMENT_VIEW_WAYPOINTS.mitochondria],
      ['chloroplasts', MISSION_PLACEMENT_VIEW_WAYPOINTS.chloroplasts],
      ['centralVacuole', MISSION_CENTRAL_VACUOLE_SIDE_WAYPOINT],
    ];

    for (const [id, viewpoint] of sequence) {
      const anchor = MISSION_RECOMMENDED_PREFAB_ANCHORS[id];
      const origin = {
        x: viewpoint.x,
        y: viewpoint.y + MISSION_PLACEMENT_EYE_HEIGHT,
        z: viewpoint.z,
      };
      const floorTarget = { x: anchor.x, y: 0.5, z: anchor.z };
      const hit = raycastVoxel(
        createMissionWorld(snapshot, true),
        origin,
        {
          x: floorTarget.x - origin.x,
          y: floorTarget.y - origin.y,
          z: floorTarget.z - origin.z,
        },
        { maxDistance: TARGET_RAYCAST_DISTANCE },
      );

      expect(hit, `${id} floor target must be reachable before placement`).toMatchObject({
        cell: { x: anchor.x, y: 0, z: anchor.z },
        adjacent: { x: anchor.x, y: 1, z: anchor.z },
        normal: { x: 0, y: 1, z: 0 },
      });
      snapshot.placements[id] = { ...anchor };
    }
  });

  it('does not announce a central-vacuole viewpoint before the floor target is in reach', () => {
    const waypoint = MISSION_CENTRAL_VACUOLE_SIDE_WAYPOINT;
    const anchor = MISSION_RECOMMENDED_PREFAB_ANCHORS.centralVacuole;
    const farEdgeArrival = {
      ...waypoint,
      x: waypoint.x + MISSION_WAYPOINT_REACHED_DISTANCE,
    };
    const guidedApproachArrival = {
      ...waypoint,
      z: waypoint.z + MISSION_WAYPOINT_REACHED_DISTANCE,
    };

    expect(isMissionPlacementViewpointReached(farEdgeArrival, waypoint, anchor)).toBe(false);
    expect(isMissionPlacementViewpointReached(guidedApproachArrival, waypoint, anchor)).toBe(true);
    expect(validatePrefabCameraClearance('centralVacuole', anchor, guidedApproachArrival)).toEqual({
      valid: true,
    });

    const staged = createInitialVoxelMissionSnapshot();
    for (const id of PLACEABLE_WITH_VIEWPOINT) {
      staged.placements[id] = { ...MISSION_RECOMMENDED_PREFAB_ANCHORS[id] };
    }
    const origin = {
      x: guidedApproachArrival.x,
      y: guidedApproachArrival.y + MISSION_PLACEMENT_EYE_HEIGHT,
      z: guidedApproachArrival.z,
    };
    const hit = raycastVoxel(
      createMissionWorld(staged, true),
      origin,
      {
        x: anchor.x - origin.x,
        y: 0.5 - origin.y,
        z: anchor.z - origin.z,
      },
      { maxDistance: TARGET_RAYCAST_DISTANCE },
    );

    expect(hit).toMatchObject({
      cell: { x: anchor.x, y: 0, z: anchor.z },
      adjacent: { x: anchor.x, y: 1, z: anchor.z },
      normal: { x: 0, y: 1, z: 0 },
    });
  });
});
