import { useEffect, useRef } from 'react';
import { VoxelMissionScene, type VoxelMissionSceneSnapshot } from '../game/VoxelMissionScene';
import {
  MISSION_PERFORMANCE_BRIDGE_KEY,
  type MissionPerformanceDiagnosticsBridge,
} from '../game/missionPerformanceDiagnostics';
import type { MissionHotbarItemId, QualityMode } from '../types/game';

export interface VoxelMissionController {
  action: () => void;
  clearInput: () => void;
  recenter: () => void;
  selectItem: (item: MissionHotbarItemId) => void;
  setActionHeld: (active: boolean) => void;
  setJoystick: (x: number, z: number) => void;
  setPaused: (paused: boolean) => void;
  toggleOverview: () => void;
}

interface VoxelMissionCanvasProps {
  initialMission?: VoxelMissionSceneSnapshot['mission'];
  reducedMotion?: boolean;
  qualityMode?: QualityMode;
  performanceDiagnostics?: boolean;
  onContextLost: () => void;
  onReady: (controller: VoxelMissionController | null) => void;
  onSnapshot: (snapshot: VoxelMissionSceneSnapshot) => void;
}

export function VoxelMissionCanvas({
  onContextLost,
  initialMission,
  reducedMotion,
  qualityMode = 'auto',
  performanceDiagnostics = false,
  onReady,
  onSnapshot,
}: VoxelMissionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialMissionRef = useRef(initialMission);
  const reducedMotionRef = useRef(reducedMotion);
  const qualityModeRef = useRef(qualityMode);
  const performanceDiagnosticsRef = useRef(performanceDiagnostics);
  const callbacksRef = useRef({ onContextLost, onReady, onSnapshot });

  useEffect(() => {
    callbacksRef.current = { onContextLost, onReady, onSnapshot };
  }, [onContextLost, onReady, onSnapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new VoxelMissionScene(
      canvas,
      {
        onContextLost: () => callbacksRef.current.onContextLost(),
        onSnapshot: (snapshot) => callbacksRef.current.onSnapshot(snapshot),
      },
      {
        initialSnapshot: initialMissionRef.current,
        reducedMotion: reducedMotionRef.current,
        qualityMode: qualityModeRef.current,
        performanceDiagnostics: performanceDiagnosticsRef.current,
      },
    );
    callbacksRef.current.onReady(controller);

    type DiagnosticsWindow = Window & {
      [MISSION_PERFORMANCE_BRIDGE_KEY]?: MissionPerformanceDiagnosticsBridge;
    };
    const diagnosticsWindow = window as DiagnosticsWindow;
    const diagnosticsBridge = Object.freeze<MissionPerformanceDiagnosticsBridge>({
      read: () => controller.performanceDiagnostics(),
    });
    if (performanceDiagnosticsRef.current) {
      Object.defineProperty(diagnosticsWindow, MISSION_PERFORMANCE_BRIDGE_KEY, {
        configurable: true,
        enumerable: false,
        value: diagnosticsBridge,
        writable: false,
      });
    }

    const clearInput = () => controller.clearInput();
    const resize = () => {
      clearInput();
      controller.resize();
    };
    const clearIfHidden = () => {
      if (document.visibilityState !== 'visible') clearInput();
    };

    window.addEventListener('blur', clearInput);
    window.addEventListener('pagehide', clearInput);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    document.addEventListener('visibilitychange', clearIfHidden);

    return () => {
      window.removeEventListener('blur', clearInput);
      window.removeEventListener('pagehide', clearInput);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      document.removeEventListener('visibilitychange', clearIfHidden);
      if (diagnosticsWindow[MISSION_PERFORMANCE_BRIDGE_KEY] === diagnosticsBridge) {
        delete diagnosticsWindow[MISSION_PERFORMANCE_BRIDGE_KEY];
      }
      callbacksRef.current.onReady(null);
      void Promise.resolve(controller.dispose()).catch(() => {
        // The scene owns best-effort final cleanup; React must not leak a rejected teardown promise.
      });
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="voxel-proof-canvas"
      aria-label="First-person integrated voxel plant-cell construction mission"
    />
  );
}
