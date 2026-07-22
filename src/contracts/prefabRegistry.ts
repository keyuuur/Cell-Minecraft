import type { PlaceableStructureId, Point3 } from '../types/game';

export interface PrefabCellOffset {
  x: number;
  z: number;
}

export interface MissionPrefabContract {
  id: PlaceableStructureId;
  occupiedOffsets: readonly PrefabCellOffset[];
  interactionClearanceOffsets: readonly PrefabCellOffset[];
  centralOnly: boolean;
}

export const MISSION_INTERIOR_BOUNDS = {
  minX: -3,
  maxX: 3,
  minZ: -5,
  maxZ: 0,
  floorY: 1,
} as const;

export const CENTRAL_VACUOLE_ANCHOR = { x: -1, y: 1, z: -4 } as const;

const rectangle = (width: number, depth: number): PrefabCellOffset[] =>
  Array.from({ length: depth }, (_, z) =>
    Array.from({ length: width }, (__, x) => ({ x, z })),
  ).flat();

const perimeter = (width: number, depth: number): PrefabCellOffset[] => {
  const cells: PrefabCellOffset[] = [];
  for (let x = -1; x <= width; x += 1) {
    cells.push({ x, z: -1 }, { x, z: depth });
  }
  for (let z = 0; z < depth; z += 1) {
    cells.push({ x: -1, z }, { x: width, z });
  }
  return cells;
};

const broadInteriorPrefab = (id: PlaceableStructureId): MissionPrefabContract => ({
  id,
  occupiedOffsets: rectangle(2, 2),
  interactionClearanceOffsets: perimeter(2, 2),
  centralOnly: false,
});

export const MISSION_PREFAB_REGISTRY: Readonly<
  Record<PlaceableStructureId, MissionPrefabContract>
> = {
  nucleus: broadInteriorPrefab('nucleus'),
  ribosomes: broadInteriorPrefab('ribosomes'),
  mitochondria: broadInteriorPrefab('mitochondria'),
  chloroplasts: broadInteriorPrefab('chloroplasts'),
  centralVacuole: {
    id: 'centralVacuole',
    occupiedOffsets: rectangle(3, 3),
    interactionClearanceOffsets: perimeter(3, 3),
    centralOnly: true,
  },
};

export const CENTRAL_VACUOLE_RESERVED_CELLS = new Set(
  MISSION_PREFAB_REGISTRY.centralVacuole.occupiedOffsets.map(
    (offset) => `${CENTRAL_VACUOLE_ANCHOR.x + offset.x},${CENTRAL_VACUOLE_ANCHOR.z + offset.z}`,
  ),
);

const cellKey = (x: number, z: number): string => `${x},${z}`;

const isInteriorCell = (x: number, z: number): boolean =>
  x >= MISSION_INTERIOR_BOUNDS.minX &&
  x <= MISSION_INTERIOR_BOUNDS.maxX &&
  z >= MISSION_INTERIOR_BOUNDS.minZ &&
  z <= MISSION_INTERIOR_BOUNDS.maxZ;

export function prefabOccupiedCells(id: PlaceableStructureId, anchor: Point3): PrefabCellOffset[] {
  return MISSION_PREFAB_REGISTRY[id].occupiedOffsets.map((offset) => ({
    x: anchor.x + offset.x,
    z: anchor.z + offset.z,
  }));
}

export function prefabInteractionCells(
  id: PlaceableStructureId,
  anchor: Point3,
): PrefabCellOffset[] {
  return MISSION_PREFAB_REGISTRY[id].interactionClearanceOffsets
    .map((offset) => ({ x: anchor.x + offset.x, z: anchor.z + offset.z }))
    .filter((cell) => isInteriorCell(cell.x, cell.z));
}

export function isValidPrefabAnchor(id: PlaceableStructureId, anchor: Point3): boolean {
  if (
    ![anchor.x, anchor.y, anchor.z].every(Number.isInteger) ||
    anchor.y !== MISSION_INTERIOR_BOUNDS.floorY
  ) {
    return false;
  }
  if (id === 'centralVacuole') {
    return (
      anchor.x === CENTRAL_VACUOLE_ANCHOR.x &&
      anchor.y === CENTRAL_VACUOLE_ANCHOR.y &&
      anchor.z === CENTRAL_VACUOLE_ANCHOR.z
    );
  }
  const cells = prefabOccupiedCells(id, anchor);
  return (
    cells.every((cell) => isInteriorCell(cell.x, cell.z)) &&
    cells.every((cell) => !CENTRAL_VACUOLE_RESERVED_CELLS.has(cellKey(cell.x, cell.z)))
  );
}

export interface PrefabPlacementValidation {
  valid: boolean;
  reason?: 'invalid-anchor' | 'overlap' | 'no-interaction-clearance';
}

export function validatePrefabPlacements(
  placements: Partial<Record<PlaceableStructureId, Point3>>,
): PrefabPlacementValidation {
  const occupied = new Set<string>();
  for (const [rawId, anchor] of Object.entries(placements)) {
    if (!anchor) continue;
    const id = rawId as PlaceableStructureId;
    if (!MISSION_PREFAB_REGISTRY[id] || !isValidPrefabAnchor(id, anchor)) {
      return { valid: false, reason: 'invalid-anchor' };
    }
    for (const cell of prefabOccupiedCells(id, anchor)) {
      const key = cellKey(cell.x, cell.z);
      if (occupied.has(key)) return { valid: false, reason: 'overlap' };
      occupied.add(key);
    }
  }

  for (const [rawId, anchor] of Object.entries(placements)) {
    if (!anchor) continue;
    const id = rawId as PlaceableStructureId;
    const hasClearance = prefabInteractionCells(id, anchor).some(
      (cell) => !occupied.has(cellKey(cell.x, cell.z)),
    );
    if (!hasClearance) return { valid: false, reason: 'no-interaction-clearance' };
  }
  return { valid: true };
}
