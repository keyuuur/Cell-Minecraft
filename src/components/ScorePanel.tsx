import { useGameStore } from '../state/gameStore';

interface ScorePanelProps {
  allowEarlySubmit?: boolean;
  onClose?: () => void;
  scoreOverride?: ReturnType<typeof useGameStore.getState>['score'];
}

const labels = {
  boundary: 'Boundary',
  requiredStructures: 'Required structures',
  placementContext: 'Placement and context',
  activationFunctions: 'Activation and functions',
  droughtRecovery: 'Drought recovery',
  finalStability: 'Final stability',
} as const;

const maximums = {
  boundary: 15,
  requiredStructures: 30,
  placementContext: 15,
  activationFunctions: 20,
  droughtRecovery: 15,
  finalStability: 5,
} as const;

export function ScorePanel({ allowEarlySubmit = false, onClose, scoreOverride }: ScorePanelProps) {
  const liveScore = useGameStore((state) => state.score);
  const score = scoreOverride ?? liveScore;
  const submitAttempt = useGameStore((state) => state.submitAttempt);
  const mission = useGameStore((state) => state.mission);

  return (
    <section className="score-panel" aria-labelledby="score-heading">
      <div className="modal-heading">
        <div>
          <p className="eyebrow">Checkpoint grade</p>
          <h2 id="score-heading">{Math.round(score.total)}%</h2>
        </div>
        {onClose && (
          <button
            className="icon-button"
            type="button"
            aria-label="Close grade breakdown"
            autoFocus
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      <dl className="score-breakdown">
        {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>
              {score[key]} / {maximums[key]}
            </dd>
          </div>
        ))}
      </dl>
      {allowEarlySubmit &&
        mission.wallPanels === 6 &&
        mission.membranePanels === 6 &&
        !mission.completionLocked && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Submit ${Math.round(score.total)}% now? Missing objectives will remain unearned.`,
                )
              ) {
                submitAttempt(true);
              }
            }}
          >
            Submit this grade early
          </button>
        )}
    </section>
  );
}
