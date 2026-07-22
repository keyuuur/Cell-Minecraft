import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { replaySubmissionQueue } from './backend/submissions';
import { GameErrorBoundary } from './components/GameErrorBoundary';
import { IdentifyScreen } from './components/IdentifyScreen';
import { IntegratedResultsScreen, type ResultsAction } from './components/IntegratedResultsScreen';
import { TutorialScreen } from './components/TutorialScreen';
import { ASSIGNMENT } from './data/assignment';
import {
  beginAttemptV3,
  classifyLegacyLocalSave,
  confirmNewStudentHandoff,
  exportV3Diagnostic,
  findResumeDecision,
  hideActiveAttemptForNewStudent,
  loadAttemptV3,
  localDataCounts,
  probePersistenceHealth,
  resumeAttemptV3,
  SaveCoordinator,
  teacherDeviceResetAllLocalData,
  TEACHER_RESET_CONFIRMATION,
} from './persistence/v3';
import {
  activeSaveFromIntegratedState,
  createFreshAttemptSave,
  createPracticeSave,
  finalizeIntegratedAttempt,
  scoreIntegratedSnapshot,
  useIntegratedGameStore,
  type IntegratedOutcome,
} from './state/integratedGameStore';
import type { SaveEnvelopeV3, StudentProfile, VoxelMissionSnapshotV1 } from './types/game';

const VoxelMissionApp = lazy(() =>
  import('./proof/VoxelMissionApp').then((module) => ({ default: module.default })),
);

function downloadText(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function finalizationMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : 'LOCAL_FINALIZATION_FAILED';
  if (code.includes('PERSISTENCE') || code.includes('INDEXED')) {
    return 'This device could not confirm the final local write. Retry before leaving this screen.';
  }
  return 'The immutable result and delivery queue were not both confirmed. Retry before continuing.';
}

const RESULTS_ACTION_FAILURE: Record<ResultsAction, string> = {
  fresh:
    'A fresh graded attempt could not be opened. This locked result is unchanged on this screen; retry, or reload and resume the matching saved attempt.',
  practice:
    'Ungraded practice could not be prepared. This locked result is unchanged; retry or ask your teacher for help.',
  'new-student':
    'Prior local work could not be protected and hidden safely. This result remains visible; ask your teacher for help before handing off the device.',
};

export default function App() {
  const performanceDiagnostics = useMemo(
    () => new URLSearchParams(window.location.search).get('diagnostics') === 'performance',
    [],
  );
  const screen = useIntegratedGameStore((state) => state.screen);
  const controls = useIntegratedGameStore((state) => state.controls);
  const qualityMode = useIntegratedGameStore((state) => state.qualityMode);
  const accessibility = useIntegratedGameStore((state) => state.accessibility);
  const activeElapsedMs = useIntegratedGameStore((state) => state.activeElapsedMs);
  const voxelMission = useIntegratedGameStore((state) => state.voxelMission);
  const gradedSnapshot = useIntegratedGameStore((state) => state.gradedSnapshot);
  const submissionStatus = useIntegratedGameStore((state) => state.submissionStatus);
  const outcome = useIntegratedGameStore((state) => state.outcome);
  const paused = useIntegratedGameStore((state) => state.paused);
  const finalizing = useIntegratedGameStore((state) => state.finalizing);
  const saveStatus = useIntegratedGameStore((state) => state.saveStatus);
  const persistenceReady = useIntegratedGameStore((state) => state.persistenceReady);
  const persistenceError = useIntegratedGameStore((state) => state.persistenceError);
  const cacheSceneSnapshot = useIntegratedGameStore((state) => state.cacheSceneSnapshot);
  const tickActiveTime = useIntegratedGameStore((state) => state.tickActiveTime);
  const setPaused = useIntegratedGameStore((state) => state.setPaused);
  const useHint = useIntegratedGameStore((state) => state.useHint);
  const setSaveStatus = useIntegratedGameStore((state) => state.setSaveStatus);
  const setFinalizing = useIntegratedGameStore((state) => state.setFinalizing);
  const showQueuedResult = useIntegratedGameStore((state) => state.showQueuedResult);
  const enterAttempt = useIntegratedGameStore((state) => state.enterAttempt);
  const enterPractice = useIntegratedGameStore((state) => state.enterPractice);
  const returnToResults = useIntegratedGameStore((state) => state.returnToResults);
  const resetForNewStudent = useIntegratedGameStore((state) => state.resetForNewStudent);
  const setPersistenceState = useIntegratedGameStore((state) => state.setPersistenceState);

  const coordinatorRef = useRef<SaveCoordinator | null>(null);
  const saveRequestTimerRef = useRef<number | null>(null);
  const finalOutcomeRef = useRef<IntegratedOutcome | null>(null);
  const resultsActionRef = useRef<ResultsAction | null>(null);
  const pendingStartedSaveRef = useRef<SaveEnvelopeV3 | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<SaveEnvelopeV3 | null>(null);
  const [handoffGeneration, setHandoffGeneration] = useState<number | null>(null);
  const [pendingStudent, setPendingStudent] = useState<StudentProfile | null>(null);
  const [resumeMessage, setResumeMessage] = useState('');
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);
  const [legacyRecoveryMessage, setLegacyRecoveryMessage] = useState('');
  const [finalizationError, setFinalizationError] = useState('');
  const [resultsActionError, setResultsActionError] = useState('');
  const [resultsAction, setResultsAction] = useState<ResultsAction | null>(null);
  const [pendingAttemptRecovery, setPendingAttemptRecovery] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [portrait, setPortrait] = useState(window.innerHeight > window.innerWidth);

  const scoreBreakdown = useMemo(
    () => scoreIntegratedSnapshot(voxelMission, gradedSnapshot, screen),
    [gradedSnapshot, screen, voxelMission],
  );

  const createCoordinator = useCallback(
    async (attemptId: string) => {
      const coordinator = await SaveCoordinator.create(attemptId, (status) => {
        if (useIntegratedGameStore.getState().attemptId === attemptId) {
          useIntegratedGameStore.getState().setSaveStatus(status);
        }
      });
      coordinatorRef.current = coordinator;
      setSaveStatus(coordinator.status);
      return coordinator;
    },
    [setSaveStatus],
  );

  const beginAndEnterFreshAttempt = useCallback(async () => {
    let save = pendingStartedSaveRef.current;
    if (!save) {
      save = createFreshAttemptSave(useIntegratedGameStore.getState());
      await beginAttemptV3(save);
      pendingStartedSaveRef.current = save;
      setPendingAttemptRecovery(true);
    }
    await createCoordinator(save.attemptId);
    enterAttempt(save);
    pendingStartedSaveRef.current = null;
    setPendingAttemptRecovery(false);
  }, [createCoordinator, enterAttempt]);

  const saveCurrent = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    const state = useIntegratedGameStore.getState();
    if (!coordinator || state.screen !== 'mission' || state.finalizing) return;
    try {
      await coordinator.requestSave(activeSaveFromIntegratedState(state));
    } catch (error) {
      const code = error instanceof Error ? error.message : 'SAVE_FAILED';
      if (code !== 'ATTEMPT_FINALIZATION_IN_PROGRESS') {
        state.setSaveStatus({ state: 'failed', code });
      }
    }
  }, []);

  const scheduleSave = useCallback(
    (delayMs = 100) => {
      if (saveRequestTimerRef.current !== null) {
        window.clearTimeout(saveRequestTimerRef.current);
      }
      saveRequestTimerRef.current = window.setTimeout(() => {
        saveRequestTimerRef.current = null;
        void saveCurrent();
      }, delayMs);
    },
    [saveCurrent],
  );

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      setPersistenceState(false);
      const health = await probePersistenceHealth();
      if (cancelled) return;
      if (health.state !== 'ready') {
        setPersistenceState(
          false,
          'Local saving is unavailable. A graded attempt cannot start safely.',
        );
        return;
      }
      setPersistenceState(true);
      try {
        const legacy = await classifyLegacyLocalSave();
        if (!cancelled && legacy.kind !== 'none') {
          setLegacyRecoveryMessage(
            legacy.kind === 'legacy-v2'
              ? 'Older prototype work was found. It will remain untouched; this version starts a fresh spatial mission.'
              : 'Older local work could not be read safely. Export diagnostics or use the teacher device reset.',
          );
        }
      } catch {
        if (!cancelled) {
          setLegacyRecoveryMessage(
            'Older local work could not be checked safely. Export diagnostics or ask your teacher for help.',
          );
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [setPersistenceState]);

  useEffect(() => {
    const replayLegacyOnly = () => {
      void replaySubmissionQueue().catch(() => undefined);
    };
    replayLegacyOnly();
    window.addEventListener('online', replayLegacyOnly);
    return () => window.removeEventListener('online', replayLegacyOnly);
  }, []);

  useEffect(() => {
    if (
      screen !== 'mission' ||
      paused ||
      portrait ||
      contextLost ||
      finalizing ||
      outcome === 'practice'
    ) {
      return;
    }
    let last = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === 'visible') {
        tickActiveTime(Math.min(500, Math.max(0, now - last)));
      }
      last = now;
    }, 250);
    return () => window.clearInterval(interval);
  }, [contextLost, finalizing, outcome, paused, portrait, screen, tickActiveTime]);

  useEffect(() => {
    if (screen !== 'mission') return;
    const interval = window.setInterval(() => void saveCurrent(), 5_000);
    return () => window.clearInterval(interval);
  }, [saveCurrent, screen]);

  useEffect(() => {
    const interrupt = () => {
      if (useIntegratedGameStore.getState().screen !== 'mission') return;
      useIntegratedGameStore.getState().setPaused(true);
      void saveCurrent();
    };
    const visibility = () => {
      if (document.visibilityState !== 'visible') interrupt();
    };
    const orientation = () => {
      const nextPortrait = window.innerHeight > window.innerWidth;
      setPortrait(nextPortrait);
      if (nextPortrait) interrupt();
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
  }, [saveCurrent]);

  useEffect(() => {
    if (screen !== 'mission' || !portrait) return;
    setPaused(true);
    void saveCurrent();
  }, [portrait, saveCurrent, screen, setPaused]);

  const finalize = useCallback(
    async (nextOutcome: IntegratedOutcome) => {
      const state = useIntegratedGameStore.getState();
      const coordinator = coordinatorRef.current;
      if (!coordinator || state.finalizing || state.screen !== 'mission') return;
      finalOutcomeRef.current = nextOutcome;
      setFinalizationError('');
      setFinalizing(true);
      setPaused(true);
      try {
        const { save, payload } = finalizeIntegratedAttempt(state, nextOutcome);
        const queued = await coordinator.finalizeAndQueue(save, payload);
        showQueuedResult(queued);
        finalOutcomeRef.current = null;
      } catch (error) {
        setFinalizationError(finalizationMessage(error));
        setFinalizing(false);
      }
    },
    [setFinalizing, setPaused, showQueuedResult],
  );

  useEffect(() => {
    if (
      screen === 'mission' &&
      outcome === 'active' &&
      activeElapsedMs >= ASSIGNMENT.durationSeconds * 1000 &&
      !finalizing &&
      !finalizationError &&
      finalOutcomeRef.current === null
    ) {
      const timeout = window.setTimeout(() => void finalize('timeout'), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [activeElapsedMs, finalizationError, finalizing, finalize, outcome, screen]);

  useEffect(
    () => () => {
      if (saveRequestTimerRef.current !== null) {
        window.clearTimeout(saveRequestTimerRef.current);
      }
    },
    [],
  );

  const handleIdentify = async (student: StudentProfile) => {
    setResumeMessage('');
    setPendingStudent(student);
    setHandoffGeneration(null);
    const decision = await findResumeDecision(student);
    if (decision.kind === 'one') {
      setResumeCandidate(decision.save);
      return;
    }
    setResumeCandidate(null);
    if (decision.kind === 'handoff') {
      setHandoffGeneration(decision.generation);
      return;
    }
    if (decision.kind === 'multiple' || decision.kind === 'blocked') {
      setResumeMessage(
        'Saved work on this device cannot be matched safely. No private details are shown; ask your teacher for help.',
      );
      return;
    }
    useIntegratedGameStore.getState().identifyStudent(student);
  };

  const handleConfirmNewStudentHandoff = async () => {
    if (!pendingStudent || handoffGeneration === null) return;
    setResumeMessage('');
    try {
      const hidden = await confirmNewStudentHandoff(handoffGeneration);
      if (!hidden) throw new Error('ACTIVE_ATTEMPT_CHANGED');
      setHandoffGeneration(null);
      useIntegratedGameStore.getState().identifyStudent(pendingStudent);
      setPendingStudent(null);
    } catch {
      setHandoffGeneration(null);
      setResumeMessage(
        'The prior session changed or could not be protected safely. Recheck the identity, or ask your teacher for help.',
      );
    }
  };

  const handleResume = async () => {
    if (!pendingStudent || !resumeCandidate) return;
    setResumeMessage('');
    try {
      await resumeAttemptV3(pendingStudent);
      const record = await loadAttemptV3(resumeCandidate.attemptId);
      if (!record) throw new Error('ATTEMPT_NOT_FOUND');
      await createCoordinator(record.attemptId);
      enterAttempt(record.save);
      setResumeCandidate(null);
      setHandoffGeneration(null);
      setPendingStudent(null);
    } catch {
      setResumeMessage(
        'The matching attempt changed or could not be opened safely. Ask your teacher for help.',
      );
    }
  };

  const handleStartFreshInstead = async () => {
    if (!pendingStudent || !resumeCandidate) return;
    setResumeMessage('');
    try {
      const hidden = await hideActiveAttemptForNewStudent(resumeCandidate.attemptId);
      if (!hidden) throw new Error('ACTIVE_ATTEMPT_CHANGED');
      const sessionId = resumeCandidate.sessionId;
      setResumeCandidate(null);
      setHandoffGeneration(null);
      useIntegratedGameStore.getState().identifyStudent(pendingStudent, sessionId);
      setPendingStudent(null);
    } catch {
      setResumeMessage('The prior attempt could not be hidden safely. Ask your teacher for help.');
    }
  };

  const startMission = async () => {
    if (starting) return;
    setStarting(true);
    setStartError('');
    try {
      await beginAndEnterFreshAttempt();
      setContextLost(false);
    } catch {
      setStartError(
        pendingStartedSaveRef.current
          ? 'The attempt is safely saved but could not open. No timer started; retry Start, or reload and resume the matching attempt.'
          : 'A fresh graded attempt could not be saved safely. No timer started; ask your teacher for help.',
      );
    } finally {
      setStarting(false);
    }
  };

  const runResultsAction = useCallback(async (action: ResultsAction, work: () => Promise<void>) => {
    if (resultsActionRef.current) return;
    resultsActionRef.current = action;
    setResultsAction(action);
    setResultsActionError('');
    try {
      await work();
    } catch {
      setResultsActionError(RESULTS_ACTION_FAILURE[action]);
    } finally {
      resultsActionRef.current = null;
      setResultsAction(null);
    }
  }, []);

  const startFreshAttempt = () =>
    runResultsAction('fresh', async () => {
      await beginAndEnterFreshAttempt();
      setContextLost(false);
      setFinalizationError('');
    });

  const startPractice = () =>
    runResultsAction('practice', async () => {
      if (pendingStartedSaveRef.current) throw new Error('ATTEMPT_OPEN_RECOVERY_REQUIRED');
      const state = useIntegratedGameStore.getState();
      const record = await loadAttemptV3(state.attemptId);
      if (!record?.save.gradedSnapshot) throw new Error('GRADED_RESULT_REQUIRED');
      const practice = createPracticeSave(record.save);
      const coordinator = await createCoordinator(record.attemptId);
      await coordinator.requestSave(practice);
      enterPractice(practice);
      setContextLost(false);
    });

  const handleNewStudent = () =>
    runResultsAction('new-student', async () => {
      const attemptId =
        pendingStartedSaveRef.current?.attemptId ?? useIntegratedGameStore.getState().attemptId;
      const hidden = await hideActiveAttemptForNewStudent(attemptId);
      if (!hidden) throw new Error('ACTIVE_ATTEMPT_CHANGED');
      coordinatorRef.current = null;
      pendingStartedSaveRef.current = null;
      setPendingAttemptRecovery(false);
      resetForNewStudent();
      setPersistenceState(true);
      setResumeCandidate(null);
      setPendingStudent(null);
      setResumeMessage('');
      setStartError('');
      setFinalizationError('');
      setContextLost(false);
    });

  const exportDiagnostic = async () => {
    downloadText('build-a-living-cell-diagnostic.json', await exportV3Diagnostic());
  };

  const handleSceneSnapshot = useCallback(
    (mission: VoxelMissionSnapshotV1) => {
      cacheSceneSnapshot(mission);
      scheduleSave();
    },
    [cacheSceneSnapshot, scheduleSave],
  );

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
      {screen === 'identify' ? (
        <IdentifyScreen
          persistenceReady={persistenceReady}
          persistenceMessage={persistenceError}
          resumeAvailable={Boolean(resumeCandidate)}
          newStudentHandoffRequired={handoffGeneration !== null}
          resumeMessage={resumeMessage}
          onIdentify={handleIdentify}
          onResume={handleResume}
          onStartFresh={handleStartFreshInstead}
          onConfirmNewStudentHandoff={handleConfirmNewStudentHandoff}
          onRequestResetCounts={async () => {
            const counts = await localDataCounts();
            return {
              attempts: counts.attempts,
              queued: counts.queuedSubmissions,
              receipts: counts.receipts,
              legacySaves: counts.legacySaves,
            };
          }}
          onTeacherReset={async (confirmation) => {
            await teacherDeviceResetAllLocalData(confirmation);
            coordinatorRef.current = null;
            pendingStartedSaveRef.current = null;
            setPendingAttemptRecovery(false);
            resetForNewStudent();
            setHandoffGeneration(null);
            setPersistenceState(true);
            setLegacyRecoveryMessage('');
          }}
          teacherResetConfirmation={TEACHER_RESET_CONFIRMATION}
        />
      ) : null}

      {screen === 'tutorial' ? (
        <TutorialScreen onStartMission={startMission} starting={starting} startError={startError} />
      ) : null}

      {screen === 'mission' ? (
        <GameErrorBoundary
          onError={() => {
            setContextLost(true);
            setPaused(true);
            void saveCurrent();
          }}
        >
          <Suspense fallback={<div className="scene-loading">Preparing voxel cell yard…</div>}>
            <VoxelMissionApp
              mode="classroom"
              initialMission={voxelMission}
              controls={controls}
              qualityMode={qualityMode}
              performanceDiagnostics={performanceDiagnostics}
              accessibility={accessibility}
              activeElapsedMs={activeElapsedMs}
              scoreBreakdown={scoreBreakdown}
              saveStatus={saveStatus}
              paused={paused || contextLost}
              externalInterruption={portrait ? 'orientation' : null}
              finalizing={finalizing}
              finalizationError={finalizationError}
              onMissionSnapshot={handleSceneSnapshot}
              onPauseChange={(nextPaused) => {
                setPaused(nextPaused);
                if (nextPaused) void saveCurrent();
              }}
              onUseHint={useHint}
              onSubmit={(nextOutcome) => finalize(nextOutcome)}
              onRetryFinalization={() =>
                finalOutcomeRef.current ? finalize(finalOutcomeRef.current) : Promise.resolve()
              }
              onReturnToResults={returnToResults}
              onContextLost={() => {
                setContextLost(true);
                setPaused(true);
                void saveCurrent();
              }}
            />
          </Suspense>
        </GameErrorBoundary>
      ) : null}

      {screen === 'results' && gradedSnapshot ? (
        <IntegratedResultsScreen
          grade={gradedSnapshot}
          submissionStatus={submissionStatus}
          actionError={resultsActionError}
          busyAction={resultsAction}
          freshRetryRequired={pendingAttemptRecovery}
          onFreshAttempt={startFreshAttempt}
          onPractice={startPractice}
          onNewStudent={handleNewStudent}
          onExportDiagnostic={exportDiagnostic}
        />
      ) : null}

      {legacyRecoveryMessage && screen === 'identify' ? (
        <aside className="recovery-banner" role="status">
          <p>{legacyRecoveryMessage}</p>
          <button type="button" onClick={exportDiagnostic}>
            Export local diagnostics
          </button>
        </aside>
      ) : null}
    </div>
  );
}
