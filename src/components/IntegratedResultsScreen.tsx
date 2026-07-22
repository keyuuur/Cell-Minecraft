import type { GradedSnapshotV1, SubmissionStatus } from '../types/game';

export type ResultsAction = 'fresh' | 'practice' | 'new-student';

interface IntegratedResultsScreenProps {
  grade: Readonly<GradedSnapshotV1>;
  submissionStatus: SubmissionStatus;
  actionError?: string;
  busyAction?: ResultsAction | null;
  freshRetryRequired?: boolean;
  onFreshAttempt: () => Promise<void> | void;
  onPractice: () => Promise<void> | void;
  onNewStudent: () => Promise<void> | void;
  onExportDiagnostic: () => Promise<void> | void;
}

const categories: Array<[keyof Omit<GradedSnapshotV1['score'], 'total'>, string, number]> = [
  ['boundary', 'Boundary', 15],
  ['requiredStructures', 'Required structures', 30],
  ['placementContext', 'Placement and context', 15],
  ['activationFunctions', 'Activation and functions', 20],
  ['droughtRecovery', 'Drought recovery', 15],
  ['finalStability', 'Final stability', 5],
];

function deliveryCopy(status: SubmissionStatus) {
  if (status === 'accepted' || status === 'duplicate') {
    return {
      mark: '✓',
      label: 'Delivered',
      detail: 'The teacher results system accepted this result.',
    };
  }
  if (status === 'rejected') {
    return {
      mark: '!',
      label: 'Needs teacher attention',
      detail: 'The locked result remains on this device and can be exported for diagnosis.',
    };
  }
  return {
    mark: '↻',
    label: 'Saved on this iPad',
    detail: 'The locked result is safely queued for the protected delivery connection.',
  };
}

export function IntegratedResultsScreen({
  grade,
  submissionStatus,
  actionError = '',
  busyAction = null,
  freshRetryRequired = false,
  onFreshAttempt,
  onPractice,
  onNewStudent,
  onExportDiagnostic,
}: IntegratedResultsScreenProps) {
  const delivery = deliveryCopy(submissionStatus);
  const heading =
    grade.outcome === 'complete'
      ? 'Stable cell achieved'
      : grade.outcome === 'timeout'
        ? 'Active time ended'
        : 'Early result saved';

  return (
    <main className="screen results-screen" aria-busy={Boolean(busyAction)}>
      <section className="results-card" aria-labelledby="integrated-results-title">
        <div className="results-summary">
          <p className="eyebrow">Graded attempt locked</p>
          <h1 id="integrated-results-title">{heading}</h1>
          <p>
            {grade.outcome === 'complete'
              ? 'The model recovered from limited water and returned to a stable state.'
              : 'Completed objectives earned partial credit. Ungraded practice cannot change this result.'}
          </p>
          <div className="locked-grade-note" role="note">
            <strong>This graded result is immutable.</strong>
            <span>Fresh attempts and practice never rewrite it.</span>
          </div>
          <div className={`delivery-status status-${submissionStatus}`} role="status">
            <span className="delivery-mark" aria-hidden="true">
              {delivery.mark}
            </span>
            <span>
              <strong>{delivery.label}</strong>
              <span>{delivery.detail}</span>
            </span>
          </div>
          {submissionStatus === 'rejected' ? (
            <button className="secondary-button" type="button" onClick={onExportDiagnostic}>
              Export delivery diagnostics
            </button>
          ) : null}
        </div>

        <section className="results-score score-panel" aria-labelledby="integrated-score-title">
          <div className="modal-heading">
            <div>
              <p className="eyebrow">Checkpoint grade</p>
              <h2 id="integrated-score-title">{Math.round(grade.score.total)}%</h2>
            </div>
          </div>
          <dl className="score-breakdown">
            {categories.map(([key, label, maximum]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {grade.score[key]} / {maximum}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="button-row results-actions">
          {actionError ? (
            <p className="form-error results-action-error" role="alert">
              {actionError}
            </p>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => void onFreshAttempt()}
          >
            {busyAction === 'fresh'
              ? 'Preparing fresh attempt...'
              : freshRetryRequired
                ? 'Retry opening saved attempt'
                : 'Start a fresh graded attempt'}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={Boolean(busyAction) || freshRetryRequired}
            onClick={() => void onPractice()}
          >
            {busyAction === 'practice' ? 'Preparing practice...' : 'Continue ungraded practice'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={Boolean(busyAction) || freshRetryRequired}
            onClick={() => void onNewStudent()}
          >
            {busyAction === 'new-student' ? 'Protecting local work...' : 'New student'}
          </button>
        </div>
      </section>
    </main>
  );
}
