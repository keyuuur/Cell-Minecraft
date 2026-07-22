import type { ScoreBreakdown } from '../types/game';

export interface ObjectiveScoreInput {
  wallPanels: number;
  membranePanels: number;
  cytoplasm: boolean;
  nucleus: boolean;
  ribosomes: boolean;
  mitochondria: boolean;
  chloroplasts: boolean;
  centralVacuole: boolean;
  droughtDiagnosed: boolean;
  droughtObserved: boolean;
  recoveryRestored: boolean;
  effectCellWall: boolean;
  effectCellMembrane: boolean;
  effectCytoplasm: boolean;
  effectNucleus: boolean;
  effectRibosomes: boolean;
  effectMitochondria: boolean;
  effectChloroplasts: boolean;
  effectCentralVacuole: boolean;
}

const round = (value: number): number => Math.round(value * 10) / 10;

/** Canonical contract-V2 rubric formula shared by mission, proxy, and backend tests. */
export function calculateObjectiveScore(
  objectives: ObjectiveScoreInput,
  completed: boolean,
): ScoreBreakdown {
  const wallComplete = objectives.wallPanels === 6;
  const membraneComplete = objectives.membranePanels === 6;
  const presentFlags = [
    wallComplete,
    membraneComplete,
    objectives.cytoplasm,
    objectives.nucleus,
    objectives.ribosomes,
    objectives.mitochondria,
    objectives.chloroplasts,
    objectives.centralVacuole,
  ];
  const effectFlags = [
    objectives.effectCellWall,
    objectives.effectCellMembrane,
    objectives.effectCytoplasm,
    objectives.effectNucleus,
    objectives.effectRibosomes,
    objectives.effectMitochondria,
    objectives.effectChloroplasts,
    objectives.effectCentralVacuole,
  ];
  const boundary = round(15 * ((objectives.wallPanels + objectives.membranePanels) / 12));
  const requiredStructures = round(30 * (presentFlags.filter(Boolean).length / 8));
  const broadInternals = [
    objectives.nucleus,
    objectives.ribosomes,
    objectives.mitochondria,
    objectives.chloroplasts,
  ].filter(Boolean).length;
  const placementContext = round(
    (wallComplete && membraneComplete ? 5 : 0) +
      (objectives.centralVacuole ? 4 : 0) +
      broadInternals * 1.5,
  );
  const activationFunctions = round(20 * (effectFlags.filter(Boolean).length / 8));
  const droughtRecovery =
    (objectives.droughtDiagnosed ? 5 : 0) +
    (objectives.droughtObserved ? 5 : 0) +
    (objectives.recoveryRestored ? 5 : 0);
  const finalStability =
    completed &&
    presentFlags.every(Boolean) &&
    effectFlags.every(Boolean) &&
    objectives.recoveryRestored
      ? 5
      : 0;
  return {
    boundary,
    requiredStructures,
    placementContext,
    activationFunctions,
    droughtRecovery,
    finalStability,
    total: round(
      boundary +
        requiredStructures +
        placementContext +
        activationFunctions +
        droughtRecovery +
        finalStability,
    ),
  };
}
