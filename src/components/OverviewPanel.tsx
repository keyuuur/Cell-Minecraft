import { statusValues } from '../biology/rules';
import {
  REQUIRED_STRUCTURES,
  STRUCTURE_FUNCTIONS,
  STRUCTURE_LABELS,
  STRUCTURE_VISIBLE_EFFECTS,
} from '../data/assignment';
import { useGameStore } from '../state/gameStore';

interface OverviewPanelProps {
  onClose: () => void;
}

export function OverviewPanel({ onClose }: OverviewPanelProps) {
  const mission = useGameStore((state) => state.mission);
  const beginDroughtChallenge = useGameStore((state) => state.beginDroughtChallenge);
  const status = statusValues(mission);

  const installed = [
    mission.wallPanels === 6 && 'cellWall',
    mission.membranePanels === 6 && 'cellMembrane',
    mission.cytoplasmEstablished && 'cytoplasm',
    ...Object.keys(mission.placements),
  ].filter(Boolean) as Array<keyof typeof STRUCTURE_LABELS>;
  const allEffectsObserved = REQUIRED_STRUCTURES.every((id) => mission.functionEvidence[id]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal-panel overview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="overview-title"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">System evidence</p>
            <h2 id="overview-title">Cell overview</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close overview"
            autoFocus
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p>Homeostasis means maintaining a stable internal environment.</p>
        <div className="overview-status-grid">
          <div>
            <strong>Boundary</strong>
            <span>{status.boundary}% secure</span>
          </div>
          <div>
            <strong>Observed functions</strong>
            <span>{status.function}% recorded</span>
          </div>
          <div>
            <strong>Turgor</strong>
            <span>{status.turgor}% pressure</span>
          </div>
        </div>
        {mission.vacuoleHydratedObserved && !mission.droughtStarted && (
          <div className="system-success" role="status">
            Baseline: the vacuole is full, turgor is high, and the plant indicator is firm.
          </div>
        )}
        {mission.droughtStarted && !mission.recoveryRestored && (
          <div className="system-warning" role="status">
            <strong>Homeostasis challenge</strong>
            <p>
              Water is limited. The central vacuole is shrinking, turgor pressure is dropping, and
              the plant is wilting.
            </p>
          </div>
        )}
        {mission.recoveryRestored && (
          <div className="system-success" role="status">
            Water storage is restored. Turgor pressure increased, and the plant is firm again.
          </div>
        )}
        <ul className="evidence-list function-evidence-list">
          {installed.map((id) => (
            <li key={id}>
              <div>
                <strong>{STRUCTURE_LABELS[id]}:</strong> {STRUCTURE_FUNCTIONS[id]}
                {mission.functionEvidence[id] && (
                  <p className="visible-effect">Visible result: {STRUCTURE_VISIBLE_EFFECTS[id]}</p>
                )}
              </div>
              <span className={mission.functionEvidence[id] ? 'evidence-recorded' : ''}>
                {mission.functionEvidence[id]
                  ? 'Effect observed'
                  : 'Inspect it in the chamber and use Interact'}
              </span>
            </li>
          ))}
        </ul>
        {mission.vacuoleHydratedObserved &&
          !mission.droughtStarted &&
          !mission.recoveryRestored && (
            <button
              className="primary-button"
              type="button"
              disabled={!allEffectsObserved}
              onClick={() => {
                beginDroughtChallenge();
                onClose();
              }}
            >
              {allEffectsObserved
                ? 'Begin water-availability challenge'
                : 'Observe all eight effects before the challenge'}
            </button>
          )}
        <button className="text-button" type="button" onClick={onClose}>
          Return to mission
        </button>
      </section>
    </div>
  );
}
