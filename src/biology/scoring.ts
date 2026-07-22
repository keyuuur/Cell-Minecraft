import type { MissionState, ScoreBreakdown } from '../types/game';
import { calculateObjectiveScore } from './submissionScoring';

export function calculateScore(mission: MissionState): ScoreBreakdown {
  return calculateObjectiveScore(
    {
      wallPanels: mission.wallPanels,
      membranePanels: mission.membranePanels,
      cytoplasm: mission.cytoplasmEstablished,
      nucleus: Boolean(mission.placements.nucleus),
      ribosomes: Boolean(mission.placements.ribosomes),
      mitochondria: Boolean(mission.placements.mitochondria),
      chloroplasts: Boolean(mission.placements.chloroplasts),
      centralVacuole: Boolean(mission.placements.centralVacuole),
      droughtDiagnosed: mission.droughtDiagnosed,
      droughtObserved: mission.droughtObserved,
      recoveryRestored: mission.recoveryRestored,
      effectCellWall: Boolean(mission.functionEvidence.cellWall),
      effectCellMembrane: Boolean(mission.functionEvidence.cellMembrane),
      effectCytoplasm: Boolean(mission.functionEvidence.cytoplasm),
      effectNucleus: Boolean(mission.functionEvidence.nucleus),
      effectRibosomes: Boolean(mission.functionEvidence.ribosomes),
      effectMitochondria: Boolean(mission.functionEvidence.mitochondria),
      effectChloroplasts: Boolean(mission.functionEvidence.chloroplasts),
      effectCentralVacuole: Boolean(mission.functionEvidence.centralVacuole),
    },
    mission.completed,
  );
}
