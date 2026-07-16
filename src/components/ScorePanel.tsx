import { useRef, useState } from 'react';
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
  const [confirmEarlySubmit, setConfirmEarlySubmit] = useState(false);
  const earlySubmitTriggerRef = useRef<HTMLButtonElement | null>(null);
  const liveScore = useGameStore((state) => state.score);
  const score = scoreOverride ?? liveScore;
  const submitAttempt = useGameStore((state) => state.submitAttempt);
  const mission = useGameStore((state) => state.mission);
  const incompleteCategories = (Object.keys(labels) as Array<keyof typeof labels>).filter(
    (key) => score[key] < maximums[key],
  );
  const canSubmitEarly =
    allowEarlySubmit &&
    mission.wallPanels === 6 &&
    mission.membranePanels === 6 &&
    !mission.completed &&
    !mission.completionLocked;

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
      {canSubmitEarly && !confirmEarlySubmit && (
        <div className="score-actions">
          <button
            ref={earlySubmitTriggerRef}
            className="secondary-button"
            type="button"
            onClick={() => setConfirmEarlySubmit(true)}
          >
            Submit this grade early
          </button>
        </div>
      )}
      {canSubmitEarly && confirmEarlySubmit && (
        <div className="early-submit-confirmation" role="alert" aria-live="polite">
          <div>
            <p className="eyebrow">Confirm early result</p>
            <h3>Submit {Math.round(score.total)}% now?</h3>
            <p>Missing objectives will remain unearned in this graded result.</p>
            <p className="missing-heading">Incomplete rubric categories:</p>
            <ul>
              {incompleteCategories.map((key) => (
                <li key={key}>
                  {labels[key]}: {score[key]} of {maximums[key]} points
                </li>
              ))}
            </ul>
          </div>
          <div className="modal-actions compact-actions">
            <button
              className="secondary-button"
              type="button"
              autoFocus
              onClick={() => {
                setConfirmEarlySubmit(false);
                window.requestAnimationFrame(() => earlySubmitTriggerRef.current?.focus());
              }}
            >
              Keep building
            </button>
            <button className="primary-button" type="button" onClick={() => submitAttempt(true)}>
              Submit grade early
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
