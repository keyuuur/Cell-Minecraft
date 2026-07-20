import { useEffect, useRef } from 'react';
import { GameScene } from '../game/GameScene';
import type { NearbyStation, NearbyStructure, PlacementPreview } from '../state/gameStore';
import type { MissionState, PlaceableStructureId } from '../types/game';
import type { Point3 } from '../types/game';

export interface StructureSliceController {
  clearInput: () => void;
  getPlacementPosition: () => { x: number; y: number; z: number };
  overview: () => void;
  recenter: () => void;
  setJoystick: (x: number, z: number) => void;
  setPaused: (paused: boolean) => void;
  setRecoveryDrop: (drop: { id: PlaceableStructureId; position: Point3 } | null) => void;
  setSelectedItem: (item: PlaceableStructureId | null) => void;
  swingTool: () => void;
}

interface StructureSliceCanvasProps {
  mission: MissionState;
  selectedItem: PlaceableStructureId | null;
  onContextLost: () => void;
  onFps: (fps: number) => void;
  onNearbyStation: (station: NearbyStation) => void;
  onNearbyStructure: (structure: NearbyStructure) => void;
  onPlacementPreview: (preview: PlacementPreview | null) => void;
  onPlayerPosition: (position: Point3) => void;
  onReady: (controller: StructureSliceController | null) => void;
  onRecoveryDropCollected: (id: PlaceableStructureId) => void;
  recoveryDrop: { id: PlaceableStructureId; position: Point3 } | null;
}

export function StructureSliceCanvas(props: StructureSliceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameScene | null>(null);
  const callbackRef = useRef(props);

  useEffect(() => {
    callbackRef.current = props;
  }, [props]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new GameScene(
      canvas,
      {
        onNearbyStation: (station) => callbackRef.current.onNearbyStation(station),
        onNearbyStructure: (structure) => callbackRef.current.onNearbyStructure(structure),
        onPlacementPreview: (preview) => callbackRef.current.onPlacementPreview(preview),
        onFps: (fps) => callbackRef.current.onFps(fps),
        onContextLost: () => callbackRef.current.onContextLost(),
        onPlayerPosition: (position) => callbackRef.current.onPlayerPosition(position),
        onRecoveryDropCollected: (id) => callbackRef.current.onRecoveryDropCollected(id),
      },
      'standard',
      false,
      'structures',
    );
    controllerRef.current = controller;
    controller.syncMission(callbackRef.current.mission);
    callbackRef.current.onReady(controller);

    const clearInput = () => controller.clearInput();
    const resize = () => controller.resize();
    const clearIfHidden = () => {
      if (document.visibilityState !== 'visible') clearInput();
    };
    window.addEventListener('blur', clearInput);
    window.addEventListener('pagehide', clearInput);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', clearInput);
    document.addEventListener('visibilitychange', clearIfHidden);
    return () => {
      window.removeEventListener('blur', clearInput);
      window.removeEventListener('pagehide', clearInput);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', clearInput);
      document.removeEventListener('visibilitychange', clearIfHidden);
      callbackRef.current.onReady(null);
      controller.dispose(canvas);
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => controllerRef.current?.syncMission(props.mission), [props.mission]);
  useEffect(() => controllerRef.current?.setSelectedItem(props.selectedItem), [props.selectedItem]);
  useEffect(() => controllerRef.current?.setRecoveryDrop(props.recoveryDrop), [props.recoveryDrop]);

  return (
    <canvas
      ref={canvasRef}
      className="voxel-proof-canvas"
      aria-label="First-person voxel plant-cell structure construction slice"
    />
  );
}
