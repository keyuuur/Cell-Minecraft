import { useEffect, useRef } from 'react';
import { BoundarySliceScene, type BoundarySliceSnapshot } from './BoundarySliceScene';

export interface BoundarySliceController {
  clearInput: () => void;
  interact: () => void;
  place: () => void;
  recenter: () => void;
  selectSlot: (slot: number) => void;
  setActionHeld: (active: boolean) => void;
  setJoystick: (x: number, z: number) => void;
  setPaused: (paused: boolean) => void;
}

interface BoundarySliceCanvasProps {
  onContextLost: () => void;
  onReady: (controller: BoundarySliceController | null) => void;
  onSnapshot: (snapshot: BoundarySliceSnapshot) => void;
}

export function BoundarySliceCanvas({
  onContextLost,
  onReady,
  onSnapshot,
}: BoundarySliceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new BoundarySliceScene(canvas, {
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
      aria-label="First-person voxel plant-cell boundary construction slice"
    />
  );
}
