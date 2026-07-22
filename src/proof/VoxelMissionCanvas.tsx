import { useEffect, useRef } from 'react';
import { VoxelMissionScene, type VoxelMissionSceneSnapshot } from '../game/VoxelMissionScene';
import type { MissionHotbarItemId } from '../types/game';

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
  onContextLost: () => void;
  onReady: (controller: VoxelMissionController | null) => void;
  onSnapshot: (snapshot: VoxelMissionSceneSnapshot) => void;
}

export function VoxelMissionCanvas({
  onContextLost,
  onReady,
  onSnapshot,
}: VoxelMissionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new VoxelMissionScene(canvas, { onContextLost, onSnapshot });
    onReady(controller);

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
      onReady(null);
      controller.dispose();
    };
  }, [onContextLost, onReady, onSnapshot]);

  return (
    <canvas
      ref={canvasRef}
      className="voxel-proof-canvas"
      aria-label="First-person integrated voxel plant-cell construction mission"
    />
  );
}
