import { useEffect, useRef } from 'react';
import { VoxelProofScene, type VoxelProofSnapshot } from './VoxelProofScene';

export interface VoxelProofController {
  clearInput: () => void;
  place: () => void;
  recenter: () => void;
  selectSlot: (slot: number) => void;
  setJoystick: (x: number, z: number) => void;
  setMining: (active: boolean) => void;
  setPaused: (paused: boolean) => void;
}

interface VoxelProofCanvasProps {
  onContextLost: () => void;
  onReady: (controller: VoxelProofController | null) => void;
  onSnapshot: (snapshot: VoxelProofSnapshot) => void;
}

export function VoxelProofCanvas({ onContextLost, onReady, onSnapshot }: VoxelProofCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new VoxelProofScene(canvas, {
      onContextLost,
      onSnapshot,
    });
    onReady(controller);

    const clearInput = () => controller.clearInput();
    const handleResize = () => controller.resize();
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') clearInput();
    };

    window.addEventListener('blur', clearInput);
    window.addEventListener('pagehide', clearInput);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('blur', clearInput);
      window.removeEventListener('pagehide', clearInput);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      onReady(null);
      controller.dispose();
    };
  }, [onContextLost, onReady, onSnapshot]);

  return (
    <canvas
      ref={canvasRef}
      className="voxel-proof-canvas"
      aria-label="First-person voxel construction proof"
    />
  );
}
