import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { activeStationIds, isStructurePresent, objectiveFor, statusValues } from '../biology/rules';
import { STRUCTURE_LABELS } from '../data/assignment';
import type { GameScene } from '../game/GameScene';
import { useGameStore } from '../state/gameStore';
import { OverviewPanel } from './OverviewPanel';
import { ScorePanel } from './ScorePanel';

interface GameHudProps {
  fps: number;
  sceneRef: MutableRefObject<GameScene | null>;
  isTestMode: boolean;
}

export function GameHud({ fps, sceneRef, isTestMode }: GameHudProps) {
  const mission = useGameStore((state) => state.mission);
  const activeElapsedMs = useGameStore((state) => state.activeElapsedMs);
  const selectedItem = useGameStore((state) => state.selectedItem);
  const nearbyStation = useGameStore((state) => state.nearbyStation);
  const nearbyStructure = useGameStore((state) => state.nearbyStructure);
  const placementPreview = useGameStore((state) => state.placementPreview);
  const score = useGameStore((state) => state.score);
  const paused = useGameStore((state) => state.paused);
  const setPaused = useGameStore((state) => state.setPaused);
  const interact = useGameStore((state) => state.interact);
  const openOverview = useGameStore((state) => state.openOverview);
  const placeSelected = useGameStore((state) => state.placeSelected);
  const removeSelected = useGameStore((state) => state.removeSelected);
  const selectItem = useGameStore((state) => state.selectItem);
  const recordHint = useGameStore((state) => state.useHint);
  const testAdvanceStage = useGameStore((state) => state.testAdvanceStage);
  const submitAttempt = useGameStore((state) => state.submitAttempt);
  const endPractice = useGameStore((state) => state.endPractice);
  const [showOverview, setShowOverview] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [hintProgress, setHintProgress] = useState({ objective: '', level: 0 });
  const modalTriggerRef = useRef<HTMLElement | null>(null);
  const selectedHotbarRef = useRef<HTMLButtonElement | null>(null);
  const status = statusValues(mission);
  const activeStations = activeStationIds(mission);
  const secondsLeft = Math.max(0, 15 * 60 - Math.floor(activeElapsedMs / 1000));
  const timer = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const collectedItems = Object.keys(mission.collected).filter(
    (id) => mission.collected[id as keyof typeof mission.collected],
  );
  const nearbyFunctionObserved = nearbyStructure
    ? Boolean(mission.functionEvidence[nearbyStructure])
    : false;
  const nearbyStationComplete = nearbyStation
    ? nearbyStation === 'waterStation'
      ? !mission.droughtStarted || mission.recoveryRestored
      : nearbyStation === 'cytoplasm'
        ? mission.cytoplasmEstablished
        : Boolean(mission.collected[nearbyStation])
    : false;
  const placeIsPrimary = Boolean(selectedItem && placementPreview?.status === 'valid');
  const interactIsPrimary =
    !placeIsPrimary &&
    Boolean(
      (nearbyStation && !nearbyStationComplete) || (nearbyStructure && !nearbyFunctionObserved),
    );
  const modalOpen = showOverview || showScore || showHints || paused;
  const turgorLabel = !mission.placements.centralVacuole
    ? 'Not set'
    : mission.droughtStarted && !mission.recoveryRestored
      ? '25% LOW'
      : mission.recoveryRestored
        ? '100% RESTORED'
        : '100% HIGH';
  const nextStationLabel = activeStations
    .map((id) => (id === 'waterStation' ? 'Water station' : STRUCTURE_LABELS[id]))
    .join(' or ');
  const showNextStationCue = Boolean(
    nextStationLabel &&
    !selectedItem &&
    !(nearbyStation && !nearbyStationComplete) &&
    !(nearbyStructure && !nearbyFunctionObserved),
  );
  const showNearbyStationLabel = Boolean(
    nearbyStation &&
    !selectedItem &&
    (!nearbyStationComplete || !nextStationLabel) &&
    !(nearbyStationComplete && nearbyStructure && !nearbyFunctionObserved),
  );
  const showNearbyStructureLabel = Boolean(
    nearbyStructure &&
    !selectedItem &&
    (!nearbyFunctionObserved || !nextStationLabel) &&
    !(nearbyStation && !nearbyStationComplete),
  );
  const interactLabel =
    nearbyStation && !nearbyStationComplete
      ? nearbyStation === 'waterStation'
        ? 'Restore water availability'
        : nearbyStation === 'cytoplasm'
          ? 'Establish Cytoplasm'
          : `Collect ${STRUCTURE_LABELS[nearbyStation]}`
      : nearbyStructure && !nearbyFunctionObserved
        ? `Inspect ${STRUCTURE_LABELS[nearbyStructure]}`
        : 'Interact';
  const objective = mission.practice
    ? 'Explore or repair the completed cell. Your recorded grade will not change.'
    : objectiveFor(mission);
  const hintLevel = hintProgress.objective === objective ? hintProgress.level : 0;
  const objectiveHints = (() => {
    if (mission.practice) {
      return [
        'Choose any completed structure you want to inspect or repair.',
        'Use Interact to review a function, or Remove selected and Place to practice a repair.',
        'Explore the completed cell, then use Pause and End practice to return to your locked result.',
      ];
    }
    if (mission.completed) {
      return [
        'Look at the completed objective and the final action controls.',
        'Your graded cell is stable. The remaining verb is Submit.',
        'Tap Submit final result to lock this completed attempt.',
      ];
    }
    if (mission.recoveryRestored) {
      return [
        'Use the system evidence display to check the recovered cell.',
        'Open Overview and compare turgor and firmness with the drought state.',
        'Tap Overview, verify 100% turgor and a firm plant, then return to the chamber.',
      ];
    }
    if (mission.droughtStarted) {
      if (!mission.droughtObserved) {
        return [
          'Look at the system evidence display for the change caused by limited water.',
          'Open Overview to observe the vacuole, turgor, and plant indicator.',
          'Tap Overview, read the 25% turgor state, then return to the chamber.',
        ];
      }
      return [
        'Look for the Water station at the far end of the chamber.',
        'Move near the Water station until the Interact cue appears.',
        'At the Water station, tap Interact to restore external water availability.',
      ];
    }
    if (mission.vacuoleHydratedObserved && status.function === 100) {
      return [
        'The next system event begins from the evidence display.',
        'Open Overview and use the water-availability challenge action.',
        'Tap Overview, then tap Begin water-availability challenge.',
      ];
    }
    if (nearbyStructure && !nearbyFunctionObserved) {
      return [
        `Stay near ${STRUCTURE_LABELS[nearbyStructure]} and watch the chamber cue.`,
        'The required verb is Interact, which records the visible function evidence.',
        `Tap Interact now to inspect ${STRUCTURE_LABELS[nearbyStructure]}.`,
      ];
    }
    if (selectedItem && placementPreview) {
      const label = STRUCTURE_LABELS[selectedItem];
      if (placementPreview.status === 'valid') {
        return [
          `Use the highlighted ${placementPreview.zoneLabel}.`,
          `The zone is valid. The required verb for ${label} is Place.`,
          `Tap Place ${label} now.`,
        ];
      }
      return [
        `Follow the labeled ${placementPreview.zoneLabel} guide.`,
        `Move while carrying ${label} until the guide says VALID ZONE.`,
        placementPreview.reason,
      ];
    }
    if (nearbyStation && !nearbyStationComplete) {
      const label =
        nearbyStation === 'waterStation'
          ? 'Water station'
          : nearbyStation === 'cytoplasm'
            ? 'Cytoplasm supply'
            : STRUCTURE_LABELS[nearbyStation];
      return [
        `Stay near the ${label} and watch for the Interact cue.`,
        'The required verb is Interact to collect or activate this mission step.',
        `Tap Interact now at the ${label}.`,
      ];
    }
    if (nextStationLabel) {
      return [
        `Look for the raised NEXT label for ${nextStationLabel}.`,
        `Move to the ${nextStationLabel} supply depot and wait for Nearby to appear.`,
        `At the ${nextStationLabel} depot, tap Interact, then follow the labeled placement zone.`,
      ];
    }
    return [
      `Start with the current objective: ${objective}`,
      'Move until a Nearby or Inspect cue appears, then use the named action.',
      `Complete this exact step: ${objective}`,
    ];
  })();

  useEffect(() => {
    sceneRef.current?.setPaused(modalOpen);
  }, [modalOpen, sceneRef]);

  useEffect(() => {
    const closeReadingModal = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showOverview) setShowOverview(false);
      else if (showScore) setShowScore(false);
      else if (showHints) setShowHints(false);
    };
    window.addEventListener('keydown', closeReadingModal);
    return () => window.removeEventListener('keydown', closeReadingModal);
  }, [showHints, showOverview, showScore]);

  useEffect(() => {
    if (!showOverview && !showScore && !showHints && !paused) {
      modalTriggerRef.current?.focus();
    }
  }, [paused, showHints, showOverview, showScore]);

  useEffect(() => {
    if (!selectedItem) return;
    const frame = window.requestAnimationFrame(() => {
      selectedHotbarRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedItem]);

  return (
    <div className="hud" aria-label="Mission controls">
      <div className="hud-content" inert={modalOpen ? true : undefined}>
        <header className="hud-top">
          <div className="objective-card">
            <span>{mission.practice ? 'Practice objective' : 'Objective'}</span>
            <strong>{objective}</strong>
          </div>
          <div className="timer-card" aria-label={`${timer} remaining`}>
            <span>{mission.practice ? 'Ungraded mode' : 'Active time'}</span>
            <strong>{mission.practice ? 'PRACTICE' : timer}</strong>
          </div>
          <button
            className="hud-button compact"
            type="button"
            onClick={(event) => {
              modalTriggerRef.current = event.currentTarget;
              sceneRef.current?.clearInput();
              setPaused(true);
            }}
          >
            Pause
          </button>
        </header>

        <aside className="status-stack" aria-label="Cell status">
          <div>
            <span aria-hidden="true">🛡</span>
            <strong>Boundary</strong>
            <small>{status.boundary}%</small>
          </div>
          <div>
            <span aria-hidden="true">⚙</span>
            <strong>Functions</strong>
            <small>{status.function}%</small>
          </div>
          <div
            className={`turgor-status ${mission.droughtStarted && !mission.recoveryRestored ? 'is-low' : mission.recoveryRestored ? 'is-restored' : ''}`}
          >
            <span aria-hidden="true">T</span>
            <strong>Turgor</strong>
            <small>{turgorLabel}</small>
          </div>
        </aside>

        <div className="feedback-toast" role="status">
          {mission.lastFeedback}
        </div>
        {showNearbyStationLabel && nearbyStation && (
          <div className="nearby-label">
            {nearbyStationComplete ? (
              <>
                {nearbyStation === 'waterStation'
                  ? 'Checked: Water station'
                  : nearbyStation === 'cytoplasm'
                    ? 'Established: Cytoplasm'
                    : `Collected: ${STRUCTURE_LABELS[nearbyStation]}`}
              </>
            ) : (
              <>
                Nearby:{' '}
                {nearbyStation === 'waterStation'
                  ? 'Water station'
                  : STRUCTURE_LABELS[nearbyStation]}
                {' — tap Interact'}
              </>
            )}
          </div>
        )}
        {showNearbyStructureLabel && nearbyStructure && (
          <div className="nearby-label">
            {nearbyFunctionObserved ? 'Observed' : 'Inspect'}: {STRUCTURE_LABELS[nearbyStructure]}
            {!nearbyFunctionObserved && ' — tap Interact'}
          </div>
        )}
        {selectedItem && placementPreview && (
          <div className={`placement-guide is-${placementPreview.status}`} role="status">
            <strong>{placementPreview.status === 'valid' ? '✓ VALID ZONE' : '✕ BLOCKED'}</strong>
            <span>
              {placementPreview.status === 'valid'
                ? `${placementPreview.zoneLabel} — tap Place.`
                : placementPreview.reason}
            </span>
          </div>
        )}
        {showNextStationCue && (
          <div className="next-station-cue">
            <strong>{activeStations.length > 1 ? 'NEXT CHOICE' : 'NEXT DEPOT'}</strong>
            <span>{nextStationLabel}</span>
          </div>
        )}

        <nav className="hotbar" aria-label="Collected cell modules">
          {collectedItems.length === 0 ? (
            <span className="empty-hotbar">No module collected</span>
          ) : (
            collectedItems.map((id) => {
              const structureId = id as keyof typeof STRUCTURE_LABELS;
              const installed = isStructurePresent(mission, structureId);
              const needsRepair =
                !installed &&
                mission.lastFeedback.toLowerCase().includes('removed') &&
                selectedItem === structureId;
              const itemState =
                selectedItem === structureId
                  ? needsRepair
                    ? 'NEEDS REPAIR'
                    : 'SELECTED'
                  : installed
                    ? 'INSTALLED'
                    : 'READY TO PLACE';
              return (
                <button
                  type="button"
                  key={id}
                  aria-label={STRUCTURE_LABELS[structureId]}
                  ref={selectedItem === id ? selectedHotbarRef : undefined}
                  className={`${selectedItem === id ? 'is-selected' : ''} ${installed ? 'is-installed' : ''} ${needsRepair ? 'needs-repair' : ''}`}
                  aria-pressed={selectedItem === id}
                  onClick={() => selectItem(structureId)}
                >
                  <span>{STRUCTURE_LABELS[structureId]}</span>
                  <small>{itemState}</small>
                </button>
              );
            })
          )}
        </nav>

        <div className="action-cluster">
          <button
            className={`hud-button context-action ${interactIsPrimary ? 'action-primary' : ''}`}
            type="button"
            aria-label={interactLabel}
            onClick={interact}
          >
            Interact
          </button>
          <button
            className={`hud-button ${placeIsPrimary ? 'action-primary' : ''}`}
            type="button"
            aria-label={selectedItem ? `Place ${STRUCTURE_LABELS[selectedItem]}` : 'Place'}
            disabled={Boolean(selectedItem && placementPreview?.status !== 'valid')}
            onClick={() =>
              placeSelected(
                sceneRef.current?.getPlacementPosition() ?? {
                  x: 0,
                  y: 1,
                  z: 0,
                },
              )
            }
          >
            {selectedItem ? `Place ${STRUCTURE_LABELS[selectedItem]}` : 'Place'}
          </button>
          <button
            className="hud-button"
            type="button"
            aria-label={
              selectedItem ? `Remove ${STRUCTURE_LABELS[selectedItem]}` : 'Remove selected'
            }
            onClick={removeSelected}
          >
            {selectedItem ? `Remove ${STRUCTURE_LABELS[selectedItem]}` : 'Remove selected'}
          </button>
          {mission.completed && !mission.practice && (
            <button
              className="hud-button completion-submit"
              type="button"
              onClick={() => submitAttempt(false)}
            >
              Submit final result
            </button>
          )}
        </div>

        <div className="utility-cluster">
          <button
            className="hud-button compact"
            type="button"
            onClick={(event) => {
              modalTriggerRef.current = event.currentTarget;
              openOverview();
              setShowOverview(true);
            }}
          >
            Overview
          </button>
          <button
            className="hud-button compact"
            type="button"
            onClick={() => sceneRef.current?.recenter()}
          >
            Recenter
          </button>
          <button
            className="hud-button compact"
            type="button"
            onClick={(event) => {
              modalTriggerRef.current = event.currentTarget;
              setShowScore(true);
            }}
          >
            {mission.practice ? 'Practice progress' : 'Grade'} {Math.round(score.total)}%
          </button>
          <button
            className="hud-button compact"
            type="button"
            onClick={(event) => {
              modalTriggerRef.current = event.currentTarget;
              setShowHints(true);
            }}
          >
            Hint
          </button>
        </div>

        {isTestMode && (
          <div className="fps-readout" aria-label={`${fps} frames per second`}>
            {fps} FPS
          </div>
        )}
        {isTestMode && <div className="test-watermark">TEST MODE · submissions excluded</div>}
        {isTestMode && (
          <div className="test-tools">
            <span>Diagnostics · {fps} FPS</span>
            <button type="button" onClick={testAdvanceStage}>
              Advance test stage
            </button>
          </div>
        )}
      </div>

      {showOverview && <OverviewPanel onClose={() => setShowOverview(false)} />}
      {showScore && (
        <div className="modal-backdrop">
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="score-heading"
          >
            <ScorePanel allowEarlySubmit onClose={() => setShowScore(false)} />
          </div>
        </div>
      )}
      {showHints && (
        <div className="modal-backdrop">
          <section
            className="modal-panel hint-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hint-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">No point deduction</p>
                <h2 id="hint-title">Hint level {hintLevel + 1} of 3</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close hints"
                autoFocus
                onClick={() => setShowHints(false)}
              >
                ×
              </button>
            </div>
            <div className="hint-objective">
              <strong>Current objective</strong>
              <span>{objective}</span>
            </div>
            <p className="hint-copy">{objectiveHints[hintLevel]}</p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  recordHint(hintLevel + 1);
                  setShowHints(false);
                }}
              >
                Use this hint
              </button>
              {hintLevel < 2 && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setHintProgress({ objective, level: hintLevel + 1 })}
                >
                  Make it more specific
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {paused && (
        <div className="modal-backdrop">
          <section
            className="modal-panel pause-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Timer stopped</p>
                <h2 id="pause-title">Mission paused</h2>
              </div>
            </div>
            <p>The active timer is stopped and held movement has been cleared.</p>
            <div className="pause-objective">
              <strong>When you resume</strong>
              <span>{objective}</span>
            </div>
            {mission.practice && (
              <p className="practice-lock-note">
                Practice is ungraded. Your recorded result is locked.
              </p>
            )}
            <div className="modal-actions">
              <button
                className="primary-button"
                type="button"
                autoFocus
                onClick={() => {
                  sceneRef.current?.clearInput();
                  setPaused(false);
                }}
              >
                Resume mission
              </button>
              {mission.practice && (
                <button className="secondary-button" type="button" onClick={endPractice}>
                  End practice and return to result
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {activeElapsedMs > 5 * 60 * 1000 && !mission.completed && !modalOpen && (
        <div className="stuck-prompt" role="status">
          Need a nudge? Open Hint—there is no point deduction.
        </div>
      )}
    </div>
  );
}
