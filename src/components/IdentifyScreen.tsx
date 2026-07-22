import { useRef, useState, type FormEvent } from 'react';
import { ASSIGNMENT } from '../data/assignment';
import type { StudentProfile } from '../types/game';

interface IdentifyScreenProps {
  persistenceReady: boolean;
  persistenceMessage?: string;
  resumeAvailable: boolean;
  newStudentHandoffRequired: boolean;
  resumeMessage?: string;
  onIdentify: (student: StudentProfile) => Promise<void> | void;
  onResume: () => Promise<void> | void;
  onStartFresh: () => Promise<void> | void;
  onConfirmNewStudentHandoff: () => Promise<void> | void;
  onRequestResetCounts: () => Promise<{
    attempts: number;
    queued: number;
    receipts: number;
    legacySaves: number;
  }>;
  onTeacherReset: (confirmation: string) => Promise<void>;
  teacherResetConfirmation: string;
}

export function IdentifyScreen({
  persistenceReady,
  persistenceMessage = '',
  resumeAvailable,
  newStudentHandoffRequired,
  resumeMessage = '',
  onIdentify,
  onResume,
  onStartFresh,
  onConfirmNewStudentHandoff,
  onRequestResetCounts,
  onTeacherReset,
  teacherResetConfirmation,
}: IdentifyScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [period, setPeriod] = useState('');
  const [error, setError] = useState('');
  const [checkingIdentity, setCheckingIdentity] = useState(false);
  const [showTeacherReset, setShowTeacherReset] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const decisionBusyRef = useRef(false);
  const [resetCounts, setResetCounts] = useState<{
    attempts: number;
    queued: number;
    receipts: number;
    legacySaves: number;
  } | null>(null);
  const cleanFirst = firstName.trim().replace(/\s+/g, ' ');
  const cleanInitial = lastInitial.trim().slice(0, 1).toUpperCase();
  const numericPeriod = Number(period);
  const canContinue =
    cleanFirst.length >= 1 &&
    cleanFirst.length <= 40 &&
    /^[A-Z]$/.test(cleanInitial) &&
    ASSIGNMENT.periods.includes(numericPeriod);
  const identityDecisionActive = resumeAvailable || newStudentHandoffRequired;
  const identityLocked = checkingIdentity || identityDecisionActive;

  const runIdentityDecision = async (work: () => Promise<void> | void) => {
    if (decisionBusyRef.current) return;
    decisionBusyRef.current = true;
    setDecisionBusy(true);
    try {
      await work();
    } finally {
      decisionBusyRef.current = false;
      setDecisionBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (cleanFirst.length < 1 || cleanFirst.length > 40) {
      setError('Enter your first name using 1–40 characters.');
      return;
    }
    if (!/^[A-Z]$/.test(cleanInitial)) {
      setError('Enter one letter for your last initial.');
      return;
    }
    if (!ASSIGNMENT.periods.includes(numericPeriod)) {
      setError('Choose your class period.');
      return;
    }
    setCheckingIdentity(true);
    setError('');
    try {
      await onIdentify({ firstName: cleanFirst, lastInitial: cleanInitial, period: numericPeriod });
    } catch {
      setError('This device could not check saved work safely. Ask your teacher for help.');
    } finally {
      setCheckingIdentity(false);
    }
  };

  return (
    <main className="screen identify-screen">
      <section className="hero-card" aria-labelledby="game-title">
        <p className="eyebrow">Ninth-grade Biology mission</p>
        <h1 id="game-title">Build a Living Cell</h1>
        <p className="hero-copy">
          Build a simplified model of a photosynthetic plant cell. Cell parts are enlarged and are
          not to scale.
        </p>
        <p className="system-copy">
          Cells are systems. Their parts work together to keep the cell functioning.
        </p>
      </section>

      <section className="form-card" aria-labelledby="identify-heading">
        <h2 id="identify-heading">Start your private attempt</h2>
        <p>Only your first name, last initial, and class period are requested.</p>
        {resumeAvailable && (
          <div className="resume-card">
            <p>A matching saved attempt is available on this device.</p>
            <div className="button-row">
              <button
                className="primary-button"
                type="button"
                disabled={decisionBusy}
                onClick={() => void runIdentityDecision(onResume)}
              >
                {decisionBusy ? 'Opening saved attempt...' : 'Resume matching attempt'}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={decisionBusy}
                onClick={() => void runIdentityDecision(onStartFresh)}
              >
                Start a new attempt instead
              </button>
            </div>
          </div>
        )}
        {newStudentHandoffRequired ? (
          <div className="resume-card" role="status">
            <p>
              A prior student session must be protected before this student begins. No name, score,
              or attempt details are shown.
            </p>
            <button
              className="primary-button"
              type="button"
              disabled={decisionBusy}
              onClick={() => void runIdentityDecision(onConfirmNewStudentHandoff)}
            >
              {decisionBusy ? 'Protecting prior work...' : 'Protect prior work and continue'}
            </button>
          </div>
        ) : null}
        {resumeMessage && (
          <p className="form-error" role="alert">
            {resumeMessage}
          </p>
        )}
        <form onSubmit={submit} noValidate>
          <label>
            First name
            <input
              autoComplete="given-name"
              maxLength={40}
              required
              disabled={identityLocked}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <label>
            Last initial
            <input
              autoComplete="family-name"
              inputMode="text"
              maxLength={1}
              required
              disabled={identityLocked}
              value={lastInitial}
              onChange={(event) => setLastInitial(event.target.value.replace(/[^a-z]/gi, ''))}
            />
          </label>
          <label>
            Class period
            <select
              className={period ? '' : 'is-placeholder'}
              required
              disabled={identityLocked}
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option value="" disabled>
                Choose 1–7
              </option>
              {ASSIGNMENT.periods.map((value) => (
                <option key={value} value={value}>
                  Period {value}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="form-guidance" id="identify-guidance">
            Complete all three fields to continue.
          </p>
          <button
            className="primary-button"
            type="submit"
            disabled={
              !canContinue ||
              !persistenceReady ||
              checkingIdentity ||
              resumeAvailable ||
              newStudentHandoffRequired
            }
            aria-describedby="identify-guidance"
          >
            {!persistenceReady
              ? 'Checking local saving…'
              : checkingIdentity
                ? 'Checking saved work…'
                : 'Continue to controls'}
          </button>
        </form>
        {persistenceMessage && (
          <p className="form-error" role="alert">
            {persistenceMessage}
          </p>
        )}
        <button
          className="text-button danger-text"
          type="button"
          onClick={async () => {
            setResetError('');
            try {
              const counts = await onRequestResetCounts();
              setResetCounts(counts);
              setShowTeacherReset(true);
            } catch {
              setResetError(
                'Local records could not be checked safely. Ask your teacher for help.',
              );
            }
          }}
        >
          Teacher device reset
        </button>
        {resetError && (
          <p className="form-error" role="alert">
            {resetError}
          </p>
        )}
        {showTeacherReset && resetCounts && (
          <section className="teacher-reset-panel" aria-labelledby="teacher-reset-title">
            <h3 id="teacher-reset-title">Teacher-only full device reset</h3>
            <p>
              This erases {resetCounts.attempts} local attempt(s), {resetCounts.queued} queued
              result(s), {resetCounts.receipts} receipt(s), and {resetCounts.legacySaves} legacy
              save(s). Results already received by the teacher Sheet cannot be erased here.
            </p>
            <label>
              Type <strong>{teacherResetConfirmation}</strong> to confirm
              <input
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowTeacherReset(false);
                  setResetConfirmation('');
                }}
              >
                Cancel
              </button>
              <button
                className="primary-button danger-button"
                type="button"
                disabled={resetConfirmation !== teacherResetConfirmation}
                onClick={async () => {
                  setResetError('');
                  try {
                    await onTeacherReset(resetConfirmation);
                    setShowTeacherReset(false);
                    setResetConfirmation('');
                    setResetCounts(null);
                  } catch {
                    setResetError(
                      'The full local reset did not complete. No success is being claimed; ask your teacher for help.',
                    );
                  }
                }}
              >
                Erase all local data
              </button>
            </div>
          </section>
        )}
      </section>
      <footer className="legal-footer">
        Independent educational project. Not approved by or associated with Mojang or Microsoft. No
        copied Minecraft assets or branding are used.
      </footer>
    </main>
  );
}
