import { useRef, useState } from 'react';
import { useIntegratedGameStore } from '../state/integratedGameStore';
import type { ControlProfile } from '../types/game';

const controlOptions: Array<{ id: ControlProfile; title: string; description: string }> = [
  {
    id: 'keyboard-touch',
    title: 'Keyboard + Touch',
    description:
      'Move with WASD or arrow keys. Drag the scene to look. Tap the large action buttons.',
  },
  {
    id: 'touch-only',
    title: 'Touch Only',
    description:
      'Move with the left joystick. Drag the right side to look. Tap the action buttons.',
  },
];

const clamp = (value: number) => Math.max(7, Math.min(93, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const DEPOT = { x: 35, y: 70 };
const TARGET = { x: 76, y: 30 };

interface TutorialScreenProps {
  onStartMission: () => Promise<void> | void;
  starting?: boolean;
  startError?: string;
}

export function TutorialScreen({
  onStartMission,
  starting = false,
  startError = '',
}: TutorialScreenProps) {
  const controls = useIntegratedGameStore((state) => state.controls);
  const setControls = useIntegratedGameStore((state) => state.setControls);
  const accessibility = useIntegratedGameStore((state) => state.accessibility);
  const updateAccessibility = useIntegratedGameStore((state) => state.updateAccessibility);
  const [practiced, setPracticed] = useState({
    move: false,
    look: false,
    mine: false,
    collect: false,
    place: false,
    inspect: false,
    recenter: false,
  });
  const [position, setPosition] = useState({ x: 12, y: 78 });
  const [collected, setCollected] = useState(false);
  const [mined, setMined] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [lookAngle, setLookAngle] = useState(0);
  const [practiceMessage, setPracticeMessage] = useState(
    'Move to the supply depot, open it with the tool, collect the cube, then place and inspect it.',
  );
  const joystickOrigin = useRef<{
    pointerX: number;
    pointerY: number;
    position: { x: number; y: number };
  } | null>(null);
  const lookOrigin = useRef<{ x: number; angle: number } | null>(null);
  const ready = Object.values(practiced).every(Boolean);

  const moveBy = (dx: number, dy: number) => {
    setPosition((value) => ({ x: clamp(value.x + dx), y: clamp(value.y + dy) }));
    setPracticed((value) => ({ ...value, move: true }));
  };

  const stopJoystick = () => {
    joystickOrigin.current = null;
  };

  const stopLooking = () => {
    lookOrigin.current = null;
  };

  return (
    <main className="screen tutorial-screen">
      <section className="tutorial-card">
        <p className="eyebrow">Before the 15-minute timer starts</p>
        <h1>Choose and practice your controls</h1>
        <div className="control-choice-grid" role="radiogroup" aria-label="Control profile">
          {controlOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              className={`choice-card ${controls === option.id ? 'is-selected' : ''}`}
              role="radio"
              aria-checked={controls === option.id}
              onClick={() => setControls(option.id)}
            >
              <span className="choice-heading">
                <strong>{option.title}</strong>
                <small className="choice-state" aria-hidden="true">
                  {controls === option.id ? '✓ Selected' : 'Select'}
                </small>
              </span>
              <span>{option.description}</span>
            </button>
          ))}
        </div>

        <div className="mission-loop" aria-label="Mission loop">
          <span>1. Navigate</span>
          <span>2. Collect</span>
          <span>3. Place</span>
          <span>4. Observe</span>
          <span>5. Repair</span>
        </div>

        <section className="control-practice" aria-labelledby="practice-heading">
          <div>
            <p className="eyebrow">Untimed miniature practice</p>
            <h2 id="practice-heading">Use the actual game verbs</h2>
            <p>{practiceMessage}</p>
            <p className="practice-checks" aria-label="Practice progress">
              {Object.entries(practiced).map(([verb, complete]) => (
                <span key={verb} className={complete ? 'is-complete' : ''}>
                  {complete ? '✓' : '○'} {verb}
                </span>
              ))}
            </p>
          </div>
          <div
            className="practice-arena"
            tabIndex={0}
            aria-label="Untimed control practice arena"
            onKeyDown={(event) => {
              const movement: Record<string, [number, number]> = {
                w: [0, -8],
                ArrowUp: [0, -8],
                s: [0, 8],
                ArrowDown: [0, 8],
                a: [-8, 0],
                ArrowLeft: [-8, 0],
                d: [8, 0],
                ArrowRight: [8, 0],
              };
              const delta = movement[event.key];
              if (delta) {
                event.preventDefault();
                moveBy(delta[0], delta[1]);
              }
            }}
          >
            <div className="practice-map" aria-label="Practice map">
              <span className="practice-depot" style={{ left: `${DEPOT.x}%`, top: `${DEPOT.y}%` }}>
                Supply
              </span>
              <span
                className={`practice-target ${placed ? 'is-complete' : ''}`}
                style={{ left: `${TARGET.x}%`, top: `${TARGET.y}%` }}
              >
                Target
              </span>
              <span
                className="practice-player"
                aria-label="Practice player"
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
              />
              {collected && !placed && <span className="carried-cube">Cube collected</span>}
              <div className="practice-horizon" style={{ transform: `translateX(${lookAngle}px)` }}>
                Drag here to look
              </div>
            </div>
            <div
              className="practice-joystick"
              aria-label="Practice movement joystick"
              onPointerDown={(event) => {
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // Synthetic browser tests have no active hardware pointer to capture.
                }
                joystickOrigin.current = {
                  pointerX: event.clientX,
                  pointerY: event.clientY,
                  position,
                };
              }}
              onPointerMove={(event) => {
                const origin = joystickOrigin.current;
                if (!origin) return;
                setPosition({
                  x: clamp(origin.position.x + (event.clientX - origin.pointerX) / 2),
                  y: clamp(origin.position.y + (event.clientY - origin.pointerY) / 2),
                });
                setPracticed((value) => ({ ...value, move: true }));
              }}
              onPointerUp={stopJoystick}
              onPointerCancel={stopJoystick}
              onLostPointerCapture={stopJoystick}
            >
              ●
            </div>
            <div
              className="look-practice"
              role="application"
              aria-label="Drag here to practice looking"
              onPointerDown={(event) => {
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  // Synthetic browser tests have no active hardware pointer to capture.
                }
                lookOrigin.current = { x: event.clientX, angle: lookAngle };
              }}
              onPointerMove={(event) => {
                if (!lookOrigin.current) return;
                const next = lookOrigin.current.angle + event.clientX - lookOrigin.current.x;
                setLookAngle(Math.max(-45, Math.min(45, next)));
                if (Math.abs(event.clientX - lookOrigin.current.x) > 12) {
                  setPracticed((value) => ({ ...value, look: true }));
                }
              }}
              onPointerUp={stopLooking}
              onPointerCancel={stopLooking}
              onLostPointerCapture={stopLooking}
            >
              LOOK — drag here
            </div>
            <div className="practice-actions">
              <button
                type="button"
                onClick={() => {
                  if (distance(position, DEPOT) > 20) {
                    setPracticeMessage('Move closer to the Supply marker before using the tool.');
                    return;
                  }
                  setMined(true);
                  setPracticed((value) => ({ ...value, mine: true }));
                  setPracticeMessage('Supply opened. Collect the visible cube drop.');
                }}
              >
                Hold tool to mine
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!mined) {
                    setPracticeMessage('Open the supply with the tool before collecting the drop.');
                    return;
                  }
                  setCollected(true);
                  setPracticed((value) => ({ ...value, collect: true }));
                  setPracticeMessage('Cube collected. Move into the Target zone and place it.');
                }}
              >
                Collect
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!collected || distance(position, TARGET) > 20) {
                    setPracticeMessage('Carry the cube into the Target zone before placing it.');
                    return;
                  }
                  setPlaced(true);
                  setPracticed((value) => ({ ...value, place: true }));
                  setPracticeMessage('Placement worked. Inspect it to record visible evidence.');
                }}
              >
                Place
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!placed) {
                    setPracticeMessage('Place the cube before inspecting its visible effect.');
                    return;
                  }
                  setPracticed((value) => ({ ...value, inspect: true }));
                  setPracticeMessage('Inspection recorded. Practice looking, then recenter.');
                }}
              >
                Inspect
              </button>
              <button
                type="button"
                onClick={() => {
                  setLookAngle(0);
                  setPracticed((value) => ({ ...value, recenter: true }));
                  setPracticeMessage('View recentered. Complete any remaining practice checks.');
                }}
              >
                Recenter
              </button>
            </div>
          </div>
        </section>

        <fieldset className="settings-fieldset">
          <legend>Accessibility options</legend>
          {(
            [
              ['largeText', 'Large text'],
              ['highContrast', 'High contrast'],
              ['reducedMotion', 'Reduced motion'],
              ['muted', 'Mute sounds'],
            ] as const
          ).map(([key, label]) => (
            <label className="toggle-row" key={key}>
              <input
                type="checkbox"
                checked={accessibility[key]}
                onChange={(event) => updateAccessibility({ [key]: event.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <button
          className="primary-button start-button"
          type="button"
          disabled={!ready || starting}
          onClick={() => onStartMission()}
        >
          {starting
            ? 'Preparing saved mission…'
            : ready
              ? 'Start mission and timer'
              : 'Practice all controls to start'}
        </button>
        {startError && (
          <p className="form-error" role="alert">
            {startError}
          </p>
        )}
      </section>
    </main>
  );
}
