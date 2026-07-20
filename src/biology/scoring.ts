import { REQUIRED_STRUCTURES } from '../data/assignment';
import type { MissionState, ScoreBreakdown } from '../types/game';
import { isStructurePresent, PANEL_TARGET } from './rules';

const round = (value: number) => Math.round(value * 10) / 10;

export function calculateScore(mission: MissionState): ScoreBreakdown {
  const panelProgress = (mission.wallPanels + mission.membranePanels) / (PANEL_TARGET * 2);
  const boundary = round(15 * panelProgress);

  const presentCount = REQUIRED_STRUCTURES.filter((id) => isStructurePresent(mission, id)).length;
  const requiredStructures = round(30 * (presentCount / REQUIRED_STRUCTURES.length));

  const wallOutsideMembrane =
    mission.wallPanels === PANEL_TARGET && mission.membranePanels === PANEL_TARGET ? 5 : 0;
  const vacuoleCentral = mission.placements.centralVacuole ? 4 : 0;
  const broadZoneCount = ['nucleus', 'ribosomes', 'mitochondria', 'chloroplasts'].filter(
    (id) => mission.placements[id as keyof typeof mission.placements],
  ).length;
  const placementContext = round(wallOutsideMembrane + vacuoleCentral + broadZoneCount * 1.5);

  const visibleEffects = REQUIRED_STRUCTURES.filter((id) => mission.functionEvidence[id]).length;
  const activationFunctions = round(20 * (visibleEffects / 8));

  const droughtRecovery =
    (mission.droughtDiagnosed ? 5 : 0) +
    (mission.droughtObserved ? 5 : 0) +
    (mission.recoveryRestored ? 5 : 0);
  const finalStability =
    mission.completed &&
    mission.recoveryRestored &&
    REQUIRED_STRUCTURES.every(
      (id) => isStructurePresent(mission, id) && mission.functionEvidence[id],
    )
      ? 5
      : 0;
  const total = round(
    boundary +
      requiredStructures +
      placementContext +
      activationFunctions +
      droughtRecovery +
      finalStability,
  );

  return {
    boundary,
    requiredStructures,
    placementContext,
    activationFunctions,
    droughtRecovery,
    finalStability,
    total,
  };
}
