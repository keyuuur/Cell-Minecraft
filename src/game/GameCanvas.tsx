import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useGameStore } from '../state/gameStore';
import { GameScene } from './GameScene';

interface GameCanvasProps {
  onFpsChange: (fps: number) => void;
  onContextLost: () => void;
  sceneRef: MutableRefObject<GameScene | null>;
  stressMode?: boolean;
}

export function GameCanvas({
  onFpsChange,
  onContextLost,
  sceneRef,
  stressMode = false,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mission = useGameStore((state) => state.mission);
  const controls = useGameStore((state) => state.controls);
  const qualityMode = useGameStore((state) => state.qualityMode);
  const paused = useGameStore((state) => state.paused);
  const setNearbyStation = useGameStore((state) => state.setNearbyStation);
  const setNearbyStructure = useGameStore((state) => state.setNearbyStructure);
  const setPlacementPreview = useGameStore((state) => state.setPlacementPreview);
  const selectedItem = useGameStore((state) => state.selectedItem);
  const [joystickActive, setJoystickActive] = useState(false);
  const joystickOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new GameScene(
      canvas,
      {
        onNearbyStation: setNearbyStation,
        onNearbyStructure: setNearbyStructure,
        onPlacementPreview: setPlacementPreview,
        onFps: onFpsChange,
        onContextLost,
      },
      qualityMode,
      stressMode,
    );
    sceneRef.current = controller;
    controller.syncMission(mission);
    const resize = () => controller.resize();
    const clear = () => {
      controller.clearInput();
      setJoystickActive(false);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('blur', clear);
    window.addEventListener('orientationchange', clear);
    document.addEventListener('visibilitychange', clear);
    window.addEventListener('pagehide', clear);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', clear);
      window.removeEventListener('orientationchange', clear);
      document.removeEventListener('visibilitychange', clear);
      window.removeEventListener('pagehide', clear);
      controller.dispose(canvas);
      sceneRef.current = null;
    };
    // The Babylon controller intentionally stays stable for the whole mission screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sceneRef.current?.syncMission(mission), [mission, sceneRef]);
  useEffect(() => sceneRef.current?.setQuality(qualityMode), [qualityMode, sceneRef]);
  useEffect(() => sceneRef.current?.setPaused(paused), [paused, sceneRef]);
  useEffect(() => sceneRef.current?.setSelectedItem(selectedItem), [sceneRef, selectedItem]);

  const moveJoystick = (clientX: number, clientY: number) => {
    const dx = clientX - joystickOrigin.current.x;
    const dy = clientY - joystickOrigin.current.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const strength = Math.min(1, length / 42);
    sceneRef.current?.setJoystick((dx / length) * strength, (-dy / length) * strength);
  };

  const stopJoystick = () => {
    setJoystickActive(false);
    sceneRef.current?.setJoystick(0, 0);
  };

  return (
    <div
      className="game-canvas-wrap"
      aria-label="Three-dimensional plant cell construction chamber"
    >
      <canvas ref={canvasRef} className="game-canvas" tabIndex={-1} />
      {controls === 'touch-only' && (
        <div
          className={`virtual-joystick ${joystickActive ? 'is-active' : ''}`}
          aria-label="Movement joystick"
          onPointerDown={(event) => {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Synthetic browser checks have no active hardware pointer to capture.
            }
            joystickOrigin.current = { x: event.clientX, y: event.clientY };
            setJoystickActive(true);
          }}
          onPointerMove={(event) => {
            if (joystickActive) moveJoystick(event.clientX, event.clientY);
          }}
          onPointerUp={stopJoystick}
          onPointerCancel={stopJoystick}
          onLostPointerCapture={stopJoystick}
        >
          <span aria-hidden="true">●</span>
        </div>
      )}
    </div>
  );
}
