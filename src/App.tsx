import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { submitOrQueue, payloadFromSave, replaySubmissionQueue } from './backend/submissions';
import type { GameScene } from './game/GameScene';
import { IdentifyScreen } from './components/IdentifyScreen';
import { TutorialScreen } from './components/TutorialScreen';
import { GameHud } from './components/GameHud';
import { ResultsScreen } from './components/ResultsScreen';
import { GameErrorBoundary } from './components/GameErrorBoundary';
import { ASSIGNMENT, GAME_VERSION, SAVE_SCHEMA_VERSION } from './data/assignment';
import {
  clearCompletedSave,
  clearIdentityForNewStudent,
  clearLocalData,
  exportDiagnostic,
  loadProgress,
  prepareSubmission,
  saveProgress,
} from './persistence/db';
import { useGameStore } from './state/gameStore';
import type { SaveEnvelope } from './types/game';

const GameCanvas = lazy(() =>
  import('./game/GameCanvas').then((module) => ({ default: module.GameCanvas })),
);

function currentSave(): SaveEnvelope | null {
  const state = useGameStore.getState();
  if (!state.student) return null;
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    assignmentId: ASSIGNMENT.id,
    assignmentVersion: ASSIGNMENT.version,
    sessionId: state.sessionId,
    attemptId: state.attemptId,
    student: state.student,
    controls: state.controls,
    qualityMode: state.qualityMode,
    accessibility: state.accessibility,
    activeElapsedMs: state.activeElapsedMs,
    mission: state.mission,
    selectedItem: state.selectedItem,
    hintsUsed: state.hintsUsed,
    score: state.score,
    gradedScore: state.gradedScore,
    gradedOutcome: state.gradedOutcome,
    submissionStatus: state.submissionStatus,
    outcome: state.mission.practice
      ? 'practice'
      : state.timedOut
        ? 'timeout'
        : state.earlySubmission
          ? 'early'
          : state.mission.completed && state.mission.completionLocked
            ? 'complete'
            : 'active',
    savedAt: Date.now(),
  };
}

export default function App() {
  const screen = useGameStore((state) => state.screen);
  const mission = useGameStore((state) => state.mission);
  const selectedItem = useGameStore((state) => state.selectedItem);
  const controls = useGameStore((state) => state.controls);
  const qualityMode = useGameStore((state) => state.qualityMode);
  const accessibility = useGameStore((state) => state.accessibility);
  const paused = useGameStore((state) => state.paused);
  const score = useGameStore((state) => state.score);
  const submissionStatus = useGameStore((state) => state.submissionStatus);
  const hydrate = useGameStore((state) => state.hydrate);
  const resetForNewStudent = useGameStore((state) => state.resetForNewStudent);
  const setPaused = useGameStore((state) => state.setPaused);
  const tickActiveTime = useGameStore((state) => state.tickActiveTime);
  const setSubmissionStatus = useGameStore((state) => state.setSubmissionStatus);
  const markSaved = useGameStore((state) => state.markSaved);
  const sceneRef = useRef<GameScene | null>(null);
  const [fps, setFps] = useState(0);
  const [resumableSave, setResumableSave] = useState<SaveEnvelope | null>(null);
  const [loadError, setLoadError] = useState('');
  const [contextLost, setContextLost] = useState(false);
  const [portrait, setPortrait] = useState(window.innerHeight > window.innerWidth);
  const isTestMode =
    new URLSearchParams(window.location.search).get('test') === '1' &&
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_TOOLS === 'true');

  const saveNow = useCallback(async () => {
    const save = currentSave();
    if (!save) return;
    await saveProgress(save);
    markSaved(save.savedAt);
  }, [markSaved]);

  const updateReceiptForCurrentAttempt = useCallback(
    async (receipt: Awaited<ReturnType<typeof replaySubmissionQueue>>[number]) => {
      const state = useGameStore.getState();
      if (state.attemptId !== receipt.attemptId) return;
      setSubmissionStatus(receipt.status);
      if (receipt.status === 'accepted' || receipt.status === 'duplicate') {
        await clearCompletedSave(receipt.attemptId);
      } else {
        const save = currentSave();
        if (save) await saveProgress({ ...save, submissionStatus: 'rejected' });
      }
    },
    [setSubmissionStatus],
  );

  const retryPendingSubmissions = useCallback(async () => {
    const state = useGameStore.getState();
    const currentAttemptIsPending =
      state.submissionStatus === 'queued' || state.submissionStatus === 'sending';
    if (currentAttemptIsPending) setSubmissionStatus('sending');
    const receipts = await replaySubmissionQueue().catch(() => []);
    const receipt = receipts.find((item) => item.attemptId === state.attemptId);
    if (receipt) await updateReceiptForCurrentAttempt(receipt);
    else if (currentAttemptIsPending && useGameStore.getState().attemptId === state.attemptId) {
      setSubmissionStatus('queued');
    }
  }, [setSubmissionStatus, updateReceiptForCurrentAttempt]);

  useEffect(() => {
    const restore = async () => {
      try {
        let saved = await loadProgress();
        if (
          saved &&
          saved.mission.completionLocked &&
          !saved.mission.practice &&
          (saved.submissionStatus === 'queued' || saved.submissionStatus === 'sending')
        ) {
          saved = { ...saved, submissionStatus: 'queued' };
          await prepareSubmission(
            saved,
            payloadFromSave(saved, {
              early: saved.outcome === 'early',
              timeout: saved.outcome === 'timeout',
              isTest: isTestMode,
            }),
          );
        }
        const receipts = await replaySubmissionQueue().catch(() => []);
        const receipt = saved
          ? receipts.find((item) => item.attemptId === saved?.attemptId)
          : undefined;
        if (saved && receipt) {
          if (receipt.status === 'accepted' || receipt.status === 'duplicate') {
            await clearCompletedSave(saved.attemptId);
            saved = null;
          } else {
            saved = { ...saved, submissionStatus: 'rejected' };
            await saveProgress(saved);
          }
        }
        setResumableSave(saved);
      } catch {
        setLoadError(
          'The saved attempt could not be read safely. Export diagnostics or reset this device.',
        );
      }
    };
    restore();
  }, [isTestMode]);

  useEffect(() => {
    const retryWhenOnline = () => retryPendingSubmissions().catch(() => undefined);
    window.addEventListener('online', retryWhenOnline);
    return () => window.removeEventListener('online', retryWhenOnline);
  }, [retryPendingSubmissions]);

  useEffect(() => {
    if (screen !== 'mission' || paused || portrait) return;
    let last = performance.now();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      tickActiveTime(Math.min(now - last, 1000));
      last = now;
    }, 250);
    return () => window.clearInterval(interval);
  }, [paused, portrait, screen, tickActiveTime]);

  useEffect(() => {
    if (!useGameStore.getState().student || screen === 'identify' || screen === 'tutorial') return;
    const timeout = window.setTimeout(() => saveNow().catch(() => undefined), 120);
    return () => window.clearTimeout(timeout);
  }, [
    mission,
    selectedItem,
    controls,
    qualityMode,
    accessibility,
    score,
    screen,
    paused,
    submissionStatus,
    saveNow,
  ]);

  useEffect(() => {
    if (screen !== 'mission') return;
    const interval = window.setInterval(() => saveNow().catch(() => undefined), 5000);
    return () => window.clearInterval(interval);
  }, [screen, saveNow]);

  useEffect(() => {
    const interrupt = () => {
      sceneRef.current?.clearInput();
      if (useGameStore.getState().screen === 'mission') setPaused(true);
      saveNow().catch(() => undefined);
    };
    const visibility = () => {
      if (document.visibilityState !== 'visible') interrupt();
    };
    const orientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      setPortrait(isPortrait);
      sceneRef.current?.clearInput();
      if (isPortrait && useGameStore.getState().screen === 'mission') setPaused(true);
      saveNow().catch(() => undefined);
    };
    window.addEventListener('blur', interrupt);
    window.addEventListener('pagehide', interrupt);
    window.addEventListener('orientationchange', orientation);
    window.addEventListener('resize', orientation);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', interrupt);
      window.removeEventListener('pagehide', interrupt);
      window.removeEventListener('orientationchange', orientation);
      window.removeEventListener('resize', orientation);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [saveNow, setPaused]);

  useEffect(() => {
    if (screen !== 'results' || mission.practice || submissionStatus !== 'idle') return;
    const save = currentSave();
    if (!save) return;
    const originatingAttemptId = save.attemptId;
    const updateOriginatingAttempt = (status: Parameters<typeof setSubmissionStatus>[0]) => {
      if (useGameStore.getState().attemptId === originatingAttemptId) {
        setSubmissionStatus(status);
      }
    };
    const payload = payloadFromSave(save, {
      early: useGameStore.getState().earlySubmission,
      timeout: useGameStore.getState().timedOut,
      isTest: isTestMode,
    });
    setSubmissionStatus('sending');
    prepareSubmission({ ...save, submissionStatus: 'sending' }, payload)
      .then(() => submitOrQueue(payload))
      .then((receipt) => {
        if (receipt) {
          updateOriginatingAttempt(receipt.status);
          if (receipt.status === 'accepted' || receipt.status === 'duplicate') {
            clearCompletedSave(originatingAttemptId).catch(() => undefined);
          }
        } else {
          updateOriginatingAttempt('queued');
        }
      })
      .catch(() => updateOriginatingAttempt('queued'));
  }, [isTestMode, mission.practice, screen, setSubmissionStatus, submissionStatus]);

  const classes = [
    'app-shell',
    accessibility.largeText && 'large-text',
    accessibility.highContrast && 'high-contrast',
    accessibility.reducedMotion && 'reduced-motion',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} data-testid="app-shell">
      {screen === 'identify' && (
        <IdentifyScreen
          resumableSave={resumableSave}
          onResume={() => resumableSave && hydrate(resumableSave)}
          onIdentify={useGameStore.getState().identifyStudent}
          onClearData={async () => {
            await clearLocalData();
            setResumableSave(null);
            setLoadError('');
            resetForNewStudent();
          }}
        />
      )}
      {screen === 'tutorial' && <TutorialScreen />}
      {screen === 'mission' && (
        <main className="mission-screen">
          <GameErrorBoundary>
            <Suspense
              fallback={<div className="scene-loading">Preparing construction chamber…</div>}
            >
              <GameCanvas
                sceneRef={sceneRef}
                stressMode={
                  isTestMode && new URLSearchParams(window.location.search).get('stress') === '1'
                }
                onFpsChange={setFps}
                onContextLost={() => {
                  setContextLost(true);
                  setPaused(true);
                }}
              />
            </Suspense>
          </GameErrorBoundary>
          <GameHud fps={fps} sceneRef={sceneRef} isTestMode={isTestMode} />
        </main>
      )}
      {screen === 'results' && (
        <ResultsScreen
          onRetry={retryPendingSubmissions}
          onExport={async () => {
            const data = await exportDiagnostic();
            const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'cell-game-diagnostic.json';
            anchor.click();
            URL.revokeObjectURL(url);
          }}
          onNewStudent={async () => {
            if (useGameStore.getState().submissionStatus === 'queued' && navigator.onLine) {
              await retryPendingSubmissions();
            }
            await clearIdentityForNewStudent();
            setResumableSave(null);
            setLoadError('');
            resetForNewStudent();
          }}
        />
      )}

      {portrait && screen === 'mission' && (
        <div
          className="orientation-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="orientation-title"
        >
          <div>
            <h2 id="orientation-title">Rotate to landscape</h2>
            <p>Your progress is saved and the active timer is paused.</p>
          </div>
        </div>
      )}
      {contextLost && (
        <div className="modal-backdrop">
          <section className="modal-panel" role="alertdialog" aria-modal="true">
            <h2>Graphics paused safely</h2>
            <p>
              The browser interrupted the 3D scene. Your mission is saved. Reload to restore the
              scene.
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload saved mission
            </button>
          </section>
        </div>
      )}
      {loadError && (
        <div className="recovery-banner" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={async () => {
              const data = await exportDiagnostic();
              const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = 'cell-game-diagnostic.json';
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export diagnostics
          </button>
          <button
            type="button"
            onClick={() => clearLocalData().then(() => window.location.reload())}
          >
            Safe reset
          </button>
        </div>
      )}
    </div>
  );
}
