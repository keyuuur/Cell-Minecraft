import type { PlaceableStructureId, Point3 } from '../types/game';

export interface PrefabCellOffset {
  x: number;
  z: number;
}

export interface MissionPrefabContract {
  id: PlaceableStructureId;
  occupiedOffsets: readonly PrefabCellOffset[];
  interactionClearanceOffsets: readonly PrefabCellOffset[];
  heightCells: number;
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
  heightCells: id === 'nucleus' ? 3 : 2,
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
    heightCells: 4,
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

export interface PrefabCollisionCell extends PrefabCellOffset {
  y: number;
}

/** Invisible logical cells used for collision and crosshair targeting. */
export function prefabCollisionCells(
  id: PlaceableStructureId,
  anchor: Point3,
): PrefabCollisionCell[] {
  const contract = MISSION_PREFAB_REGISTRY[id];
  return contract.occupiedOffsets.flatMap((offset) =>
    Array.from({ length: contract.heightCells }, (_, y) => ({
      x: anchor.x + offset.x,
      y: anchor.y + y,
      z: anchor.z + offset.z,
    })),
  );
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
  reason?:
    | 'invalid-anchor'
    | 'overlap'
    | 'no-interaction-clearance'
    | 'unreachable-interaction'
    | 'no-completable-layout';
}

function reachableInteriorCells(occupied: ReadonlySet<string>): Set<string> {
  const reachable = new Set<string>();
  const queue: PrefabCellOffset[] = [];
  for (let x = MISSION_INTERIOR_BOUNDS.minX; x <= MISSION_INTERIOR_BOUNDS.maxX; x += 1) {
    const key = cellKey(x, MISSION_INTERIOR_BOUNDS.maxZ);
    if (!occupied.has(key)) {
      reachable.add(key);
      queue.push({ x, z: MISSION_INTERIOR_BOUNDS.maxZ });
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: cell.x + dx, z: cell.z + dz };
      const key = cellKey(next.x, next.z);
      if (!isInteriorCell(next.x, next.z) || occupied.has(key) || reachable.has(key)) continue;
      reachable.add(key);
      queue.push(next);
    }
  }
  return reachable;
}

function validateConcretePrefabPlacements(
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

  const reachable = reachableInteriorCells(occupied);
  for (const [rawId, anchor] of Object.entries(placements)) {
    if (!anchor) continue;
    const id = rawId as PlaceableStructureId;
    const hasReachableClearance = prefabInteractionCells(id, anchor).some((cell) =>
      reachable.has(cellKey(cell.x, cell.z)),
    );
    if (!hasReachableClearance) {
      return { valid: false, reason: 'unreachable-interaction' };
    }
  }
  return { valid: true };
}

const broadAnchors = (): Point3[] => {
  const anchors: Point3[] = [];
  for (let x = MISSION_INTERIOR_BOUNDS.minX; x < MISSION_INTERIOR_BOUNDS.maxX; x += 1) {
    for (let z = MISSION_INTERIOR_BOUNDS.minZ; z < MISSION_INTERIOR_BOUNDS.maxZ; z += 1) {
      const anchor = { x, y: MISSION_INTERIOR_BOUNDS.floorY, z };
      if (isValidPrefabAnchor('nucleus', anchor)) anchors.push(anchor);
    }
  }
  return anchors;
};

const anchorKey = (point: Point3): string => `${point.x},${point.y},${point.z}`;

const physicalLayoutSignature = (anchors: readonly Point3[]): string =>
  anchors.map(anchorKey).sort().join('|');

let completeLayoutSignatures: Set<string> | null = null;

function buildCompleteLayoutSignatures(): Set<string> {
  const signatures = new Set<string>();
  const ids: PlaceableStructureId[] = ['nucleus', 'ribosomes', 'mitochondria', 'chloroplasts'];
  const anchors = broadAnchors();
  const search = (start: number, selected: Point3[]): void => {
    if (selected.length === ids.length) {
      const complete = Object.fromEntries(ids.map((id, index) => [id, selected[index]])) as Partial<
        Record<PlaceableStructureId, Point3>
      >;
      complete.centralVacuole = { ...CENTRAL_VACUOLE_ANCHOR };
      if (validateConcretePrefabPlacements(complete).valid) {
        signatures.add(physicalLayoutSignature(selected));
      }
      return;
    }
    for (let index = start; index < anchors.length; index += 1) {
      const candidate = [...selected, anchors[index]];
      const partial = Object.fromEntries(
        candidate.map((anchor, candidateIndex) => [ids[candidateIndex], anchor]),
      ) as Partial<Record<PlaceableStructureId, Point3>>;
      if (!validateConcretePrefabPlacements(partial).valid) continue;
      search(index + 1, candidate);
    }
  };
  search(0, []);
  return signatures;
}

function matchesPartialLayout(
  signature: string,
  placements: Partial<Record<PlaceableStructureId, Point3>>,
): boolean {
  if (
    placements.centralVacuole &&
    anchorKey(placements.centralVacuole) !== anchorKey(CENTRAL_VACUOLE_ANCHOR)
  ) {
    return false;
  }
  const entries = new Set(signature.split('|'));
  return Object.entries(placements).every(([id, point]) =>
    !point || id === 'centralVacuole' ? true : entries.has(anchorKey(point)),
  );
}

export function canCompletePrefabPlacements(
  placements: Partial<Record<PlaceableStructureId, Point3>>,
): boolean {
  completeLayoutSignatures ??= buildCompleteLayoutSignatures();
  return [...completeLayoutSignatures].some((signature) =>
    matchesPartialLayout(signature, placements),
  );
}

export function validatePrefabPlacements(
  placements: Partial<Record<PlaceableStructureId, Point3>>,
): PrefabPlacementValidation {
  const concrete = validateConcretePrefabPlacements(placements);
  if (!concrete.valid) return concrete;
  return canCompletePrefabPlacements(placements)
    ? { valid: true }
    : { valid: false, reason: 'no-completable-layout' };
}

export interface PrefabPlayerSafetyValidation {
  valid: boolean;
  reason?: 'player-overlap' | 'player-trapped';
}

export interface PrefabCameraClearanceValidation {
  valid: boolean;
  reason?: 'camera-too-close';
}

export const PREFAB_CAMERA_CLEARANCE: Readonly<Record<PlaceableStructureId, number>> = {
  nucleus: 0.82,
  ribosomes: 0.82,
  mitochondria: 0.82,
  chloroplasts: 0.82,
  centralVacuole: 1.08,
};

/** Keeps the first-person eye outside a padded visual envelope before placement mutates state. */
export function validatePrefabCameraClearance(
  id: PlaceableStructureId,
  anchor: Point3,
  player: Point3,
): PrefabCameraClearanceValidation {
  const cells = prefabOccupiedCells(id, anchor);
  const minimumX = Math.min(...cells.map((cell) => cell.x)) - 0.5;
  const maximumX = Math.max(...cells.map((cell) => cell.x)) + 0.5;
  const minimumZ = Math.min(...cells.map((cell) => cell.z)) - 0.5;
  const maximumZ = Math.max(...cells.map((cell) => cell.z)) + 0.5;
  const gapX = Math.max(minimumX - player.x, 0, player.x - maximumX);
  const gapZ = Math.max(minimumZ - player.z, 0, player.z - maximumZ);
  return Math.hypot(gapX, gapZ) + 1e-9 >= PREFAB_CAMERA_CLEARANCE[id]
    ? { valid: true }
    : { valid: false, reason: 'camera-too-close' };
}

/** Validates the continuous player body and a walkable route back to the open front. */
export function validatePrefabPlayerSafety(
  placements: Partial<Record<PlaceableStructureId, Point3>>,
  player: Point3,
): PrefabPlayerSafetyValidation {
  const playerRadius = 0.32;
  const playerHeight = 1.7;
  for (const [rawId, anchor] of Object.entries(placements)) {
    if (!anchor) continue;
    const id = rawId as PlaceableStructureId;
    for (const cell of prefabCollisionCells(id, anchor)) {
      const overlaps =
        player.x + playerRadius > cell.x - 0.5 &&
        player.x - playerRadius < cell.x + 0.5 &&
        player.y + playerHeight > cell.y - 0.5 &&
        player.y < cell.y + 0.5 &&
        player.z + playerRadius > cell.z - 0.5 &&
        player.z - playerRadius < cell.z + 0.5;
      if (overlaps) return { valid: false, reason: 'player-overlap' };
    }
  }

  const playerCell = { x: Math.round(player.x), z: Math.round(player.z) };
  if (!isInteriorCell(playerCell.x, playerCell.z)) return { valid: true };
  const occupied = new Set<string>();
  for (const [rawId, anchor] of Object.entries(placements)) {
    if (!anchor) continue;
    const id = rawId as PlaceableStructureId;
    prefabOccupiedCells(id, anchor).forEach((cell) => occupied.add(cellKey(cell.x, cell.z)));
  }
  return reachableInteriorCells(occupied).has(cellKey(playerCell.x, playerCell.z))
    ? { valid: true }
    : { valid: false, reason: 'player-trapped' };
}
