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

const hints = [
  'Look for the depot whose color and label match the current objective.',
  'Collect the current module, move into its broad valid zone, then use Place.',
  'Follow the objective exactly: wall outside membrane, cytoplasm fill, paired structures, central vacuole, then diagnose and restore water.',
];

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
  const [hintLevel, setHintLevel] = useState(0);
  const modalTriggerRef = useRef<HTMLElement | null>(null);
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

  return (
    <div className="hud" aria-label="Mission controls">
      <div className="hud-content" inert={modalOpen ? true : undefined}>
        <header className="hud-top">
          <div className="objective-card">
            <span>Objective</span>
            <strong>{objectiveFor(mission)}</strong>
          </div>
          <div className="timer-card" aria-label={`${timer} remaining`}>
            <span>{mission.practice ? 'Ungraded' : 'Active time'}</span>
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
        {nearbyStation && !selectedItem && (!nearbyStationComplete || !nextStationLabel) && (
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
        {!nearbyStation &&
          nearbyStructure &&
          !selectedItem &&
          (!nearbyFunctionObserved || !nextStationLabel) && (
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
            onClick={interact}
          >
            Interact
          </button>
          <button
            className={`hud-button ${placeIsPrimary ? 'action-primary' : ''}`}
            type="button"
            aria-label="Place"
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
            aria-label="Remove selected"
            onClick={removeSelected}
          >
            {selectedItem ? `Remove ${STRUCTURE_LABELS[selectedItem]}` : 'Remove selected'}
          </button>
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
          {mission.completed && !mission.practice && (
            <button
              className="hud-button compact completion-submit"
              type="button"
              onClick={() => submitAttempt(false)}
            >
              Submit final result
            </button>
          )}
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
              <h2 id="hint-title">Hint level {hintLevel + 1}</h2>
              <button
                className="icon-button"
                type="button"
                autoFocus
                onClick={() => setShowHints(false)}
              >
                ×
              </button>
            </div>
            <p>{hints[hintLevel]}</p>
            <div className="button-row">
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
                  onClick={() => setHintLevel((value) => value + 1)}
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
            <h2 id="pause-title">Mission paused</h2>
            <p>The active timer is stopped and held movement has been cleared.</p>
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
          </section>
        </div>
      )}
    </div>
  );
}
