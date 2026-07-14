import { useGameStore } from '../state/gameStore';
import { ScorePanel } from './ScorePanel';

interface ResultsScreenProps {
  onNewStudent: () => Promise<void>;
  onRetry: () => Promise<void>;
  onExport: () => Promise<void>;
}

export function ResultsScreen({ onNewStudent, onRetry, onExport }: ResultsScreenProps) {
  const gradedScore = useGameStore((state) => state.gradedScore);
  const gradedOutcome = useGameStore((state) => state.gradedOutcome);
  const submissionStatus = useGameStore((state) => state.submissionStatus);
  const timedOut = useGameStore((state) => state.timedOut);
  const earlySubmission = useGameStore((state) => state.earlySubmission);
  const continuePractice = useGameStore((state) => state.continuePractice);
  const startMission = useGameStore((state) => state.startMission);
  const controlsDisabled = submissionStatus === 'sending';

  const statusText =
    submissionStatus === 'accepted' || submissionStatus === 'duplicate'
      ? 'Result delivered successfully.'
      : submissionStatus === 'queued'
        ? 'Result saved on this device and queued for delivery.'
        : submissionStatus === 'sending'
          ? 'Delivering result…'
          : submissionStatus === 'rejected'
            ? 'The result was not accepted. Your completion remains saved.'
            : 'Preparing result…';

  return (
    <main className="screen results-screen">
      <section className="results-card">
        <p className="eyebrow">Attempt complete</p>
        <h1>
          {gradedOutcome === 'complete'
            ? 'Stable cell achieved'
            : gradedOutcome === 'timeout' || timedOut
              ? 'Active time ended'
              : gradedOutcome === 'early' || earlySubmission
                ? 'Early result saved'
                : 'Checkpoint result'}
        </h1>
        <p>
          {gradedOutcome === 'complete'
            ? 'The cell system recovered from limited water and returned to a stable state.'
            : 'Your completed objectives earned partial credit. You can continue in ungraded practice.'}
        </p>
        <ScorePanel scoreOverride={gradedScore ?? undefined} />
        <p className={`delivery-status status-${submissionStatus}`} role="status">
          {statusText}
        </p>
        <div className="button-row">
          {submissionStatus === 'queued' && (
            <button className="secondary-button" type="button" onClick={() => onRetry()}>
              Retry delivery now
            </button>
          )}
          {submissionStatus === 'rejected' && (
            <button className="secondary-button" type="button" onClick={() => onExport()}>
              Export delivery diagnostics
            </button>
          )}
          <button
            className="primary-button"
            type="button"
            disabled={controlsDisabled}
            onClick={continuePractice}
          >
            Continue ungraded practice
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={controlsDisabled}
            onClick={() => startMission(false)}
          >
            Start a fresh graded attempt
          </button>
          <button
            className="text-button"
            type="button"
            disabled={controlsDisabled}
            onClick={() => onNewStudent()}
          >
            New student
          </button>
        </div>
      </section>
    </main>
  );
}
