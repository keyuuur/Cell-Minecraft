import type { AssignmentDefinition, PlaceableStructureId, StructureId } from '../types/game';

export const GAME_VERSION = '0.1.0';
export const SAVE_SCHEMA_VERSION = 2;

export const REQUIRED_STRUCTURES: StructureId[] = [
  'cellWall',
  'cellMembrane',
  'cytoplasm',
  'nucleus',
  'ribosomes',
  'mitochondria',
  'chloroplasts',
  'centralVacuole',
];

export const PLACEABLE_STRUCTURES: PlaceableStructureId[] = [
  'nucleus',
  'ribosomes',
  'mitochondria',
  'chloroplasts',
  'centralVacuole',
];

export const ASSIGNMENT: AssignmentDefinition = {
  id: 'build-a-living-cell-unit1',
  version: 1,
  title: 'Build a Living Cell',
  periods: [1, 2, 3, 4, 5, 6, 7],
  durationSeconds: 15 * 60,
  stages: [
    'boundary',
    'cytoplasm',
    'control-and-protein',
    'energy-and-photosynthesis',
    'water-storage',
    'drought-diagnosis',
    'recovery',
    'stable',
  ],
  requiredStructures: REQUIRED_STRUCTURES,
  rubric: {
    boundary: 15,
    requiredStructures: 30,
    placementContext: 15,
    activationFunctions: 20,
    droughtRecovery: 15,
    finalStability: 5,
  },
  featureFlags: {
    practice: true,
    earlySubmission: true,
    testTools: true,
  },
};

export const STRUCTURE_LABELS: Record<StructureId, string> = {
  cellWall: 'Cell wall panels',
  cellMembrane: 'Cell membrane panels',
  cytoplasm: 'Cytoplasm',
  nucleus: 'Nucleus',
  ribosomes: 'Ribosomes',
  mitochondria: 'Mitochondria',
  chloroplasts: 'Chloroplasts',
  centralVacuole: 'Large central vacuole',
};

export const STRUCTURE_FUNCTIONS: Record<StructureId, string> = {
  cellWall: 'The cell wall supports the plant cell.',
  cellMembrane: 'The cell membrane protects the cell and controls what enters and leaves.',
  cytoplasm: 'Cytoplasm is the gelatin-like material that fills the inside of the cell.',
  nucleus: 'The nucleus contains DNA and helps control cell activities.',
  ribosomes: 'Ribosomes make proteins.',
  mitochondria: 'Mitochondria break down glucose to release usable energy for the cell.',
  chloroplasts: 'Photosynthesis occurs in chloroplasts.',
  centralVacuole: 'The large central vacuole stores water and helps maintain turgor pressure.',
};

export const STRUCTURE_VISIBLE_EFFECTS: Record<StructureId, string> = {
  cellWall:
    'Game cue: the thick outer support frame brightens after its support function is observed.',
  cellMembrane:
    'Game cue: the thin inner double band brightens after its protection and movement-control function is observed.',
  cytoplasm:
    "Game cue: the interior fill brightens after the cell's gelatin-like internal medium is observed.",
  nucleus:
    'Game cue: DNA bars and a control-signal stack illuminate after the nucleus function is observed.',
  ribosomes:
    'Game cue: a short protein-chain model extends from the ribosome cluster after its function is observed.',
  mitochondria:
    'Game cue: amber cellular-energy bars rise above the mitochondria after glucose breakdown is observed.',
  chloroplasts:
    'Game cue: square sunlight markers illuminate the chloroplast bands after photosynthesis is observed.',
  centralVacuole:
    'Game cue: water-level bands and outward support braces show water storage and high turgor.',
};
