import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera.pure';
import '@babylonjs/core/Culling/ray';
import { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.pure';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.pure';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.pure';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.pure';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.pure';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.pure';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.pure';
import '@babylonjs/core/Rendering/edgesRenderer';
import { Scene } from '@babylonjs/core/scene.pure';
import type { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import {
  MISSION_PREFAB_REGISTRY,
  validatePrefabCameraClearance,
  validatePrefabPlacements,
  validatePrefabPlayerSafety,
} from '../contracts/prefabRegistry';
import { STRUCTURE_LABELS } from '../data/assignment';
import type {
  MissionCommand,
  MissionHotbarItemId,
  MissionModuleId,
  MissionTarget,
  MissionViewModel,
  PlaceableStructureId,
  QualityMode,
  VoxelMissionSnapshotV1,
} from '../types/game';
import { MissionPrefabAssetRegistry } from './MissionPrefabAssetRegistry';
import {
  MissionPerformanceRecorder,
  type MissionPerformanceDiagnosticsV1,
} from './missionPerformanceDiagnostics';
import { resolveMissionPresentation, type MissionRuntimePresentation } from './missionPresentation';
import { BOUNDARY_SECTORS, nextBoundarySector, type BoundaryLayer } from '../voxel/boundaryAdapter';
import {
  MISSION_RECOMMENDED_PREFAB_ANCHORS,
  MISSION_STRUCTURE_ORDER,
} from '../voxel/missionDefinition';
import {
  activeMissionSupplies,
  createInitialVoxelMissionSnapshot,
  executeMissionCommand,
  selectMissionViewModel,
  VoxelMissionRuntime,
} from '../voxel/missionRuntime';
import {
  createMissionWorld,
  CYTOPLASM_CONTROL_CELL,
  MISSION_SUPPLY_CELLS,
  missionWorldOwnerAt,
  syncMissionWorld,
  WATER_STATION_CELL,
} from '../voxel/missionWorld';
import { movePlayer } from '../voxel/PlayerMotor';
import { raycastVoxel, type VoxelRaycastHit } from '../voxel/raycastVoxel';
import { type VoxelPoint } from '../voxel/types';
import { VoxelWorldRenderer } from '../voxel/babylon/VoxelWorldRenderer';

const EYE_HEIGHT = 1.7;
const PLAYER_SPEED = 3.5;
const TARGET_INTERVAL = 0.08;
const SNAPSHOT_INTERVAL = 0.12;
const CENTRAL_VACUOLE_ENTRY_WAYPOINT = { x: 3, y: 1, z: 1 } as const;
const CENTRAL_VACUOLE_SIDE_WAYPOINT = { x: 3, y: 1, z: -2 } as const;
const PLANT_INDICATOR_POSITION = { x: -6, y: 0, z: 4 } as const;
const MISSION_MODULE_IDS_FOR_HOTBAR: Partial<Record<string, MissionModuleId>> = {
  Digit2: 'cellWall',
  Digit3: 'cellMembrane',
  Digit4: 'nucleus',
  Digit5: 'ribosomes',
  Digit6: 'mitochondria',
  Digit7: 'chloroplasts',
  Digit8: 'centralVacuole',
};

const allInternalEvidenceForScene = (snapshot: Readonly<VoxelMissionSnapshotV1>): boolean =>
  snapshot.boundary.functionEvidence.cellWall &&
  snapshot.boundary.functionEvidence.cellMembrane &&
  snapshot.boundary.functionEvidence.cytoplasm &&
  MISSION_STRUCTURE_ORDER.every(
    (id) => Boolean(snapshot.placements[id]) && snapshot.functionEvidence[id] === true,
  );

const isPlaceableStructureId = (id: MissionModuleId): id is PlaceableStructureId =>
  MISSION_STRUCTURE_ORDER.some((structureId) => structureId === id);

export interface VoxelMissionDiagnostics {
  world: '24x12x24';
  revision: number;
  playerCell: string;
  playerPosition: string;
  recenterCell: string;
  recenterStage: 'normal' | 'central-entry' | 'central-side' | 'central-anchor';
  targetKind: string;
  targetCell: string;
  targetFace: string;
  placementValid: boolean;
  pickupsActive: number;
  prefabCount: number;
  regionMeshes: number;
  totalRegionRebuilds: number;
  actionHeld: boolean;
  actionProgress: number;
  paused: boolean;
  overview: boolean;
  contextLost: boolean;
  quality: MissionRuntimePresentation['quality'];
  renderWidth: number;
  renderHeight: number;
  renderLoopActive: boolean;
  assetRequests: number;
  assetFailures: number;
  assetInstances: number;
  cytoplasmSolidCells: 0;
  storageWrites: 0;
  apiRequests: 0;
}

export interface VoxelMissionSceneSnapshot {
  mission: VoxelMissionSnapshotV1;
  target: MissionTarget | null;
  targetLabel: string;
  viewModel: MissionViewModel;
  score: number;
  fps: number;
  diagnostics: VoxelMissionDiagnostics;
}

export interface VoxelMissionSceneCallbacks {
  onSnapshot: (snapshot: VoxelMissionSceneSnapshot) => void;
  onContextLost: () => void;
}

export interface VoxelMissionSceneOptions {
  initialSnapshot?: VoxelMissionSnapshotV1;
  reducedMotion?: boolean;
  qualityMode?: QualityMode;
  performanceDiagnostics?: boolean;
}

interface PrefabVisual {
  root: TransformNode;
  fallback: TransformNode;
  evidence: TransformNode;
  key: string;
  assetAttached: boolean;
}

interface LabelVisual {
  texture: DynamicTexture;
  material: StandardMaterial;
  mesh: Mesh;
  lastText: string;
}

function pointLabel(point: VoxelPoint | null): string {
  return point ? `${point.x},${point.y},${point.z}` : 'none';
}

function faceLabel(normal: VoxelPoint | null): string {
  if (!normal) return 'none';
  if (normal.x > 0) return '+X';
  if (normal.x < 0) return '-X';
  if (normal.y > 0) return '+Y';
  if (normal.y < 0) return '-Y';
  if (normal.z > 0) return '+Z';
  if (normal.z < 0) return '-Z';
  return 'inside';
}

function createEdgeMarker(
  scene: Scene,
  name: string,
  material: StandardMaterial,
  size = 1.08,
): TransformNode {
  const root = new TransformNode(name, scene);
  const half = size / 2;
  const thickness = 0.035;
  const definitions: Array<{
    size: { width: number; height: number; depth: number };
    position: Vector3;
  }> = [];
  for (const y of [-half, half]) {
    for (const z of [-half, half]) {
      definitions.push({
        size: { width: size, height: thickness, depth: thickness },
        position: new Vector3(0, y, z),
      });
    }
  }
  for (const x of [-half, half]) {
    for (const z of [-half, half]) {
      definitions.push({
        size: { width: thickness, height: size, depth: thickness },
        position: new Vector3(x, 0, z),
      });
    }
  }
  for (const x of [-half, half]) {
    for (const y of [-half, half]) {
      definitions.push({
        size: { width: thickness, height: thickness, depth: size },
        position: new Vector3(x, y, 0),
      });
    }
  }
  definitions.forEach((definition, index) => {
    const edge = CreateBox(`${name}-${index}`, definition.size, scene);
    edge.parent = root;
    edge.position.copyFrom(definition.position);
    edge.material = material;
    edge.isPickable = false;
    edge.renderingGroupId = 3;
  });
  return root;
}

function createInvalidCross(scene: Scene, name: string, material: StandardMaterial): TransformNode {
  const root = new TransformNode(name, scene);
  for (const rotation of [-Math.PI / 4, Math.PI / 4]) {
    const stroke = CreateBox(
      `${name}-${rotation}`,
      { width: 1.15, height: 0.07, depth: 0.07 },
      scene,
    );
    stroke.parent = root;
    stroke.rotation.z = rotation;
    stroke.material = material;
    stroke.isPickable = false;
    stroke.renderingGroupId = 3;
  }
  return root;
}

function rayBoxDistance(
  origin: Vector3,
  direction: Vector3,
  center: VoxelPoint,
  halfExtent: number,
): number | null {
  let near = 0;
  let far = 5;
  for (const axis of ['x', 'y', 'z'] as const) {
    const minimum = center[axis] - halfExtent;
    const maximum = center[axis] + halfExtent;
    const component = direction[axis];
    if (Math.abs(component) < 1e-8) {
      if (origin[axis] < minimum || origin[axis] > maximum) return null;
      continue;
    }
    const first = (minimum - origin[axis]) / component;
    const second = (maximum - origin[axis]) / component;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return null;
  }
  return near >= 0 && near <= 5 ? near : null;
}

export class VoxelMissionScene {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: VoxelMissionSceneCallbacks;
  private readonly renderWorld;
  private readonly collisionWorld;
  private readonly runtime: VoxelMissionRuntime;
  private readonly worldRenderer: VoxelWorldRenderer;
  private readonly keys = new Set<string>();
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly prefabVisuals = new Map<PlaceableStructureId, PrefabVisual>();
  private readonly pickupMeshes = new Map<number, Mesh>();
  private readonly supplyLabels = new Map<string, LabelVisual>();
  private readonly toolRoot: TransformNode;
  private readonly pickRoot: TransformNode;
  private readonly heldModule: Mesh;
  private readonly targetOutline: TransformNode;
  private readonly invalidCross: TransformNode;
  private readonly outlineMaterial: StandardMaterial;
  private readonly cytoplasmFill: Mesh;
  private readonly wallEvidenceRoot: TransformNode;
  private readonly membraneEvidenceRoot: TransformNode;
  private readonly plantIndicatorRoot: TransformNode;
  private readonly reducedMotion: boolean;
  private readonly presentation: MissionRuntimePresentation;
  private readonly prefabAssets: MissionPrefabAssetRegistry;
  private readonly performanceRecorder: MissionPerformanceRecorder | null;
  private sceneInstrumentation: SceneInstrumentation | null = null;
  private performanceInstrumentationRequested = false;
  private performanceInstrumentationError = false;
  private performanceSnapshot: MissionPerformanceDiagnosticsV1 | null = null;
  private lastPerformanceRefresh = 0;
  private currentTarget: MissionTarget | null = null;
  private currentHit: VoxelRaycastHit | null = null;
  private currentViewModel: MissionViewModel;
  private targetLabel = '';
  private placementValid = false;
  private cameraClearanceBlocked = false;
  private joystick = { x: 0, z: 0 };
  private pointerId: number | null = null;
  private pointerPoint = { x: 0, y: 0 };
  private actionHeld = false;
  private actionProgress = 0;
  private swingTime = 0;
  private paused = false;
  private stopped = false;
  private contextLost = false;
  private disposed = false;
  private renderLoopRunning = false;
  private overview = false;
  private overviewReturn: { position: Vector3; rotation: Vector3; fov: number } | null = null;
  private lastRecenterPoint: VoxelPoint | null = null;
  private lastRecenterStage: VoxelMissionDiagnostics['recenterStage'] = 'normal';
  private lastTime = performance.now();
  private targetTick = 0;
  private snapshotTick = 0;
  private lastFpsUpdate = 0;
  private fps = 0;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: VoxelMissionSceneCallbacks,
    options: VoxelMissionSceneOptions = {},
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    const navigatorCapabilities = navigator as Navigator & { deviceMemory?: number };
    this.presentation = resolveMissionPresentation(
      options.qualityMode ?? 'auto',
      options.reducedMotion,
      {
        deviceMemory: navigatorCapabilities.deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
        devicePixelRatio: window.devicePixelRatio,
        osReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      },
    );
    this.reducedMotion = this.presentation.effectiveReducedMotion;
    this.performanceRecorder = options.performanceDiagnostics
      ? new MissionPerformanceRecorder(this.presentation)
      : null;
    const initial = options.initialSnapshot ?? createInitialVoxelMissionSnapshot();
    this.renderWorld = createMissionWorld(initial, false);
    this.collisionWorld = createMissionWorld(initial, true);
    this.runtime = new VoxelMissionRuntime(this.collisionWorld, initial);
    this.engine = new Engine(
      canvas,
      true,
      {
        preserveDrawingBuffer: false,
        stencil: false,
        powerPreference: this.presentation.quality === 'low' ? 'low-power' : 'high-performance',
        adaptToDeviceRatio: false,
      },
      true,
    );
    this.engine.setHardwareScalingLevel(this.presentation.hardwareScalingLevel);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString('#87d6f5ff');
    this.scene.fogMode =
      this.presentation.quality === 'low' ? Scene.FOGMODE_NONE : Scene.FOGMODE_LINEAR;
    this.scene.fogColor = Color3.FromHexString('#87d6f5');
    this.scene.fogStart = 19;
    this.scene.fogEnd = 35;
    this.scene.skipPointerMovePicking = true;
    this.camera = new UniversalCamera(
      'voxel-mission-camera',
      new Vector3(initial.player.x, initial.player.y + EYE_HEIGHT, initial.player.z),
      this.scene,
    );
    this.camera.minZ = 0.08;
    this.camera.maxZ = 48;
    this.camera.fov = 1.2;
    this.camera.rotation.set(initial.player.pitch, initial.player.yaw, 0);
    this.camera.inputs.clear();
    this.scene.activeCamera = this.camera;
    this.prefabAssets = new MissionPrefabAssetRegistry(
      this.scene,
      this.presentation.quality === 'standard',
    );

    const skyLight = new HemisphericLight(
      'voxel-mission-sky',
      new Vector3(0.2, 1, 0.15),
      this.scene,
    );
    skyLight.intensity = 1.18;
    skyLight.groundColor = Color3.FromHexString('#677b5f');
    const sun = new DirectionalLight('voxel-mission-sun', new Vector3(-0.45, -1, 0.3), this.scene);
    sun.intensity = 0.52;

    this.worldRenderer = new VoxelWorldRenderer(this.scene, this.renderWorld);
    this.worldRenderer.buildInitialWorld();
    this.createSupplyLabels();
    const tool = this.createTool();
    this.toolRoot = tool.root;
    this.pickRoot = tool.pick;
    this.heldModule = tool.heldModule;
    this.outlineMaterial = this.material('mission-outline', '#efff8a', 0.95);
    this.outlineMaterial.disableDepthWrite = true;
    this.targetOutline = createEdgeMarker(
      this.scene,
      'mission-target-outline',
      this.outlineMaterial,
    );
    this.targetOutline.setEnabled(false);
    const invalidMaterial = this.material('mission-invalid', '#ff755f', 0.96);
    invalidMaterial.disableDepthWrite = true;
    this.invalidCross = createInvalidCross(this.scene, 'mission-invalid-cross', invalidMaterial);
    this.invalidCross.setEnabled(false);
    this.cytoplasmFill = this.createCytoplasm();
    this.wallEvidenceRoot = this.createBoundaryEvidence('cellWall');
    this.membraneEvidenceRoot = this.createBoundaryEvidence('cellMembrane');
    this.plantIndicatorRoot = this.createPlantIndicator();
    this.currentViewModel = selectMissionViewModel(initial, null);
    this.reconcileSnapshot();
    this.attachInput();
    canvas.addEventListener('webglcontextlost', this.handleContextLost, { passive: false });
    this.startRenderLoop();
    if (!options.initialSnapshot) this.recenter();
    this.emitSnapshot();
  }

  private requestPerformanceInstrumentation(): void {
    if (!this.performanceRecorder || this.performanceInstrumentationRequested || this.disposed) {
      return;
    }
    this.performanceInstrumentationRequested = true;
    void import('@babylonjs/core/Instrumentation/sceneInstrumentation')
      .then(({ SceneInstrumentation: BabylonSceneInstrumentation }) => {
        if (this.disposed || this.contextLost) return;
        const instrumentation = new BabylonSceneInstrumentation(this.scene);
        this.sceneInstrumentation = instrumentation;
        this.refreshPerformanceDiagnostics();
      })
      .catch(() => {
        if (this.disposed || this.contextLost) return;
        this.performanceInstrumentationError = true;
        this.refreshPerformanceDiagnostics();
      });
  }

  private material(name: string, color: string, alpha = 1): StandardMaterial {
    const key = `${name}:${color}:${alpha}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.emissiveColor = Color3.FromHexString(color).scale(alpha < 1 ? 0.18 : 0.04);
    material.specularColor = Color3.Black();
    material.alpha = alpha;
    this.materials.set(key, material);
    return material;
  }

  private pixelMaterial(
    name: string,
    colors: [string, string, string],
    alpha = 1,
  ): StandardMaterial {
    const key = `${name}:${colors.join(':')}:${alpha}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const texture = new DynamicTexture(
      `${name}-texture`,
      { width: 32, height: 32 },
      this.scene,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    );
    const context = texture.getContext();
    context.fillStyle = colors[0];
    context.fillRect(0, 0, 32, 32);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const pattern = (x * 5 + y * 7 + x * y) % 13;
        if (pattern !== 0 && pattern !== 4) continue;
        context.fillStyle = pattern === 0 ? colors[1] : colors[2];
        context.fillRect(x * 4, y * 4, 4, 4);
      }
    }
    texture.update(false);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    const material = this.material(name, '#ffffff', alpha);
    material.diffuseTexture = texture;
    this.materials.set(key, material);
    return material;
  }

  private createSupplyLabels(): void {
    const labels: Array<[string, string, VoxelPoint]> = [
      ...Object.entries(MISSION_SUPPLY_CELLS).map(
        ([id, point]) =>
          [id, STRUCTURE_LABELS[id as MissionModuleId], point] as [string, string, VoxelPoint],
      ),
      ['cytoplasm', 'Cytoplasm control', CYTOPLASM_CONTROL_CELL],
      ['waterStation', 'Water availability station', WATER_STATION_CELL],
      ['plantStatus', 'Plant condition: firm', PLANT_INDICATOR_POSITION],
    ];
    labels.forEach(([id, label, point]) => {
      const texture = new DynamicTexture(
        `mission-label-${id}`,
        { width: 512, height: 128 },
        this.scene,
        false,
      );
      const material = new StandardMaterial(`mission-label-material-${id}`, this.scene);
      material.diffuseTexture = texture;
      material.emissiveColor = Color3.White();
      material.opacityTexture = texture;
      // DynamicTexture is uploaded without a Y inversion, so correct the vertical texture axis
      // once while the Y-only billboard keeps the plane upright and left-to-right readable.
      texture.vScale = -1;
      texture.vOffset = 1;
      material.backFaceCulling = false;
      const mesh = CreatePlane(
        `mission-label-plane-${id}`,
        { width: 3.4, height: 0.85 },
        this.scene,
      );
      mesh.position.set(point.x, point.y + 2.3, point.z);
      // Supply signs only need to turn around the vertical axis. A full billboard can roll
      // upside down when the first-person camera looks above or below a raised label.
      mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
      mesh.material = material;
      mesh.isPickable = false;
      this.supplyLabels.set(id, { texture, material, mesh, lastText: '' });
      this.drawLabel(id, label);
    });
  }

  private createPlantIndicator(): TransformNode {
    const root = new TransformNode('mission-plant-condition', this.scene);
    root.position.set(
      PLANT_INDICATOR_POSITION.x,
      PLANT_INDICATOR_POSITION.y,
      PLANT_INDICATOR_POSITION.z,
    );
    const pot = this.pixelMaterial('mission-plant-pot-material', ['#8e5f3d', '#c88854', '#5a3c2b']);
    const stem = this.material('mission-plant-stem-material', '#39784a');
    const leaf = this.pixelMaterial('mission-plant-leaf-material', [
      '#4e9851',
      '#78bd66',
      '#2d653c',
    ]);
    this.addPart(
      root,
      'mission-plant-pot',
      { width: 1.5, height: 0.65, depth: 1.15 },
      new Vector3(0, 0.33, 0),
      pot,
    );
    this.addPart(
      root,
      'mission-plant-stem',
      { width: 0.35, height: 2.8, depth: 0.35 },
      new Vector3(0, 1.95, 0),
      stem,
    );
    for (const [index, [x, y, z]] of [
      [-0.65, 1.45, 0],
      [0.65, 2.05, 0],
      [0, 2.65, 0],
    ].entries()) {
      this.addPart(
        root,
        `mission-plant-leaf-${index}`,
        { width: 1.15, height: 0.38, depth: 0.72 },
        new Vector3(x, y + 0.55, z),
        leaf,
      );
    }
    return root;
  }

  private drawLabel(id: string, text: string): void {
    const visual = this.supplyLabels.get(id);
    if (!visual || visual.lastText === text) return;
    const context = visual.texture.getContext() as CanvasRenderingContext2D;
    context.clearRect(0, 0, 512, 128);
    context.fillStyle = 'rgba(11, 27, 24, 0.9)';
    context.fillRect(0, 0, 512, 128);
    context.strokeStyle = '#f4d35e';
    context.lineWidth = 8;
    context.strokeRect(4, 4, 504, 120);
    context.fillStyle = '#ffffff';
    context.font = 'bold 34px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text.toUpperCase(), 256, 64, 470);
    visual.texture.update(false);
    visual.lastText = text;
  }

  private createTool(): { root: TransformNode; pick: TransformNode; heldModule: Mesh } {
    const root = new TransformNode('mission-held-tool', this.scene);
    root.parent = this.camera;
    root.position = new Vector3(0.82, -0.57, 1.28);
    root.rotation = new Vector3(-0.2, -0.16, -0.18);
    root.scaling = new Vector3(0.46, 0.46, 0.46);
    const pick = new TransformNode('mission-builder-pick', this.scene);
    pick.parent = root;
    const handle = CreateBox(
      'mission-pick-handle',
      { width: 0.26, height: 2.5, depth: 0.26 },
      this.scene,
    );
    handle.parent = pick;
    handle.rotation.z = -0.65;
    handle.material = this.pixelMaterial('mission-pick-handle-material', [
      '#254c49',
      '#356e68',
      '#173431',
    ]);
    const head = CreateBox(
      'mission-pick-head',
      { width: 2.1, height: 0.38, depth: 0.48 },
      this.scene,
    );
    head.parent = pick;
    head.position.set(-0.72, 0.92, 0);
    head.rotation.z = -0.18;
    head.material = this.pixelMaterial('mission-pick-head-material', [
      '#d4aa4e',
      '#f4d35e',
      '#8d682b',
    ]);
    const heldModule = CreateBox('mission-held-module', { size: 1.2 }, this.scene);
    heldModule.parent = root;
    heldModule.material = this.material('mission-held-default', '#f4d35e');
    heldModule.isPickable = false;
    heldModule.setEnabled(false);
    return { root, pick, heldModule };
  }

  private createCytoplasm(): Mesh {
    const fill = CreateBox(
      'mission-cytoplasm-volume',
      { width: 7, height: 4.8, depth: 6 },
      this.scene,
    );
    fill.position.set(0, 2.9, -2.5);
    fill.material = this.material('mission-cytoplasm-material', '#efd778', 0.14);
    fill.isPickable = false;
    fill.renderingGroupId = 1;
    fill.enableEdgesRendering();
    fill.edgesColor = Color4.FromHexString('#f9e99ccc');
    fill.edgesWidth = 1.2;
    fill.setEnabled(false);
    return fill;
  }

  private createBoundaryEvidence(layer: BoundaryLayer): TransformNode {
    const root = new TransformNode(`mission-${layer}-evidence`, this.scene);
    const color = layer === 'cellWall' ? '#d7f07b' : '#75e0ef';
    const material = this.material(`mission-${layer}-evidence-material`, color, 0.92);
    const points =
      layer === 'cellWall'
        ? [
            [-5.6, 2.1, -5.4],
            [5.6, 2.1, -5.4],
            [-5.6, 2.1, -1.6],
            [5.6, 2.1, -1.6],
          ]
        : [
            [-3.7, 2.2, -1],
            [-1.2, 2.2, -1],
            [1.2, 2.2, -1],
            [3.7, 2.2, -1],
          ];
    points.forEach(([x, y, z], index) => {
      const cue = CreateBox(
        `mission-${layer}-effect-${index}`,
        layer === 'cellWall'
          ? { width: 0.18, height: 2.8, depth: 0.42 }
          : { width: 0.36, height: 0.36, depth: 0.36 },
        this.scene,
      );
      cue.parent = root;
      cue.position.set(x, y, z);
      cue.material = material;
      cue.isPickable = false;
    });
    root.setEnabled(false);
    return root;
  }

  private addPart(
    parent: TransformNode,
    name: string,
    dimensions: { width: number; height: number; depth: number },
    position: Vector3,
    material: StandardMaterial,
  ): Mesh {
    const mesh = CreateBox(name, dimensions, this.scene);
    mesh.parent = parent;
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }

  private createPrefabVisual(
    id: PlaceableStructureId,
    anchor: { x: number; y: number; z: number },
    observed: boolean,
  ): PrefabVisual {
    const root = new TransformNode(`mission-prefab-${id}`, this.scene);
    const footprint = MISSION_PREFAB_REGISTRY[id].occupiedOffsets;
    const maximumX = Math.max(...footprint.map((cell) => cell.x));
    const maximumZ = Math.max(...footprint.map((cell) => cell.z));
    root.position.set(anchor.x + maximumX / 2, 0, anchor.z + maximumZ / 2);
    const fallback = new TransformNode(`mission-prefab-fallback-${id}`, this.scene);
    fallback.parent = root;
    const evidence = new TransformNode(`mission-prefab-evidence-${id}`, this.scene);
    evidence.parent = root;

    if (id === 'nucleus') {
      this.addPart(
        fallback,
        'mission-nucleus-core',
        { width: 1.65, height: 2.45, depth: 1.65 },
        new Vector3(0, 1.85, 0),
        this.pixelMaterial('mission-nucleus-core-material', ['#8955ae', '#b47bd2', '#573575']),
      );
      this.addPart(
        fallback,
        'mission-nuclear-membrane',
        { width: 1.9, height: 2.8, depth: 1.9 },
        new Vector3(0, 1.85, 0),
        this.pixelMaterial(
          'mission-nuclear-membrane-material',
          ['#d8c3e8', '#f1e6f7', '#997fb3'],
          0.22,
        ),
      );
      for (let index = 0; index < 6; index += 1) {
        this.addPart(
          evidence,
          `mission-nucleus-dna-${index}`,
          { width: 0.26, height: 0.26, depth: 0.2 },
          new Vector3(Math.sin(index * 1.55) * 0.5, 1 + index * 0.34, -1.02),
          this.material('mission-nucleus-evidence-material', '#f4d35e'),
        );
      }
    } else if (id === 'ribosomes') {
      for (let index = 0; index < 12; index += 1) {
        this.addPart(
          fallback,
          `mission-ribosome-${index}`,
          { width: 0.32, height: 0.32, depth: 0.32 },
          new Vector3(
            (index % 4) * 0.42 - 0.63,
            1.15 + Math.floor(index / 4) * 0.38,
            (index % 3) * 0.32 - 0.32,
          ),
          this.pixelMaterial('mission-ribosome-material', ['#f2eee6', '#ffffff', '#8c8981']),
        );
      }
      for (let index = 0; index < 7; index += 1) {
        this.addPart(
          evidence,
          `mission-protein-chain-${index}`,
          { width: 0.25, height: 0.25, depth: 0.25 },
          new Vector3(index * 0.28 - 0.84, 2.5 + (index % 2) * 0.25, 0),
          this.material('mission-protein-chain-material', '#fff0a8'),
        );
      }
    } else if (id === 'mitochondria') {
      const bodyMaterial = this.pixelMaterial('mission-mitochondria-body-material', [
        '#df704f',
        '#ff9a6f',
        '#8c3c31',
      ]);
      this.addPart(
        fallback,
        'mission-mitochondria-center',
        { width: 1.25, height: 1.05, depth: 1.18 },
        new Vector3(0, 1.45, 0),
        bodyMaterial,
      );
      this.addPart(
        fallback,
        'mission-mitochondria-lobe-left',
        { width: 0.68, height: 0.88, depth: 1.05 },
        new Vector3(-0.72, 1.35, 0.08),
        bodyMaterial,
      );
      this.addPart(
        fallback,
        'mission-mitochondria-lobe-right',
        { width: 0.72, height: 1.18, depth: 0.96 },
        new Vector3(0.72, 1.52, -0.08),
        bodyMaterial,
      );
      const ridgeMaterial = this.pixelMaterial('mission-mitochondria-ridge-material', [
        '#6f2e27',
        '#a84e3e',
        '#3e1b1a',
      ]);
      for (let index = 0; index < 4; index += 1) {
        const ridge = this.addPart(
          fallback,
          `mission-mitochondria-crista-${index}`,
          { width: 0.42, height: 0.16, depth: 1.25 },
          new Vector3((index - 1.5) * 0.42, 1.44 + (index % 2) * 0.18, 0),
          ridgeMaterial,
        );
        ridge.rotation.z = index % 2 === 0 ? 0.38 : -0.38;
      }
      for (let index = 0; index < 5; index += 1) {
        this.addPart(
          evidence,
          `mission-mitochondria-energy-bar-${index}`,
          { width: 0.23, height: 0.4 + index * 0.12, depth: 0.23 },
          new Vector3(index * 0.34 - 0.68, 2.25 + index * 0.08, 0),
          this.material('mission-mitochondria-effect-material', '#ffbc62'),
        );
      }
    } else if (id === 'chloroplasts') {
      const bodyMaterial = this.pixelMaterial('mission-chloroplasts-body-material', [
        '#4f9a4e',
        '#76c15f',
        '#285f34',
      ]);
      this.addPart(
        fallback,
        'mission-chloroplasts-lower-lens',
        { width: 1.78, height: 0.42, depth: 1.22 },
        new Vector3(0, 1.2, 0),
        bodyMaterial,
      );
      this.addPart(
        fallback,
        'mission-chloroplasts-upper-lens',
        { width: 1.48, height: 0.36, depth: 1.48 },
        new Vector3(0, 1.58, 0),
        bodyMaterial,
      );
      const granaMaterial = this.pixelMaterial('mission-chloroplasts-grana-material', [
        '#c4ed65',
        '#efff97',
        '#6f9e38',
      ]);
      for (let stack = 0; stack < 3; stack += 1) {
        for (let layer = 0; layer < 3; layer += 1) {
          this.addPart(
            fallback,
            `mission-chloroplasts-grana-${stack}-${layer}`,
            { width: 0.34, height: 0.1, depth: 0.48 },
            new Vector3((stack - 1) * 0.5, 1.75 + layer * 0.13, 0),
            granaMaterial,
          );
        }
      }
      for (let index = 0; index < 5; index += 1) {
        this.addPart(
          evidence,
          `mission-chloroplasts-sunlight-tile-${index}`,
          { width: 0.3, height: 0.3, depth: 0.3 },
          new Vector3(index * 0.34 - 0.68, 2.3 + (index % 2) * 0.18, 0),
          this.material('mission-chloroplasts-effect-material', '#fff36b'),
        );
      }
    } else {
      this.addPart(
        fallback,
        'mission-central-vacuole-body',
        { width: 2.58, height: 3.55, depth: 2.58 },
        new Vector3(0, 2.32, 0),
        this.pixelMaterial(
          'mission-central-vacuole-material',
          ['#53b6cf', '#8fe3ef', '#2a7f9a'],
          0.58,
        ),
      );
      for (let index = 0; index < 3; index += 1) {
        this.addPart(
          evidence,
          `mission-vacuole-water-level-${index}`,
          { width: 2.5, height: 0.1, depth: 2.5 },
          new Vector3(0, 1.4 + index * 0.9, 0),
          this.material('mission-vacuole-water-material', '#d7fbff', 0.86),
        );
      }
      for (const [index, [x, z]] of [
        [-1.75, 0],
        [1.75, 0],
        [0, -1.75],
        [0, 1.75],
      ].entries()) {
        this.addPart(
          evidence,
          `mission-vacuole-support-${index}`,
          { width: x === 0 ? 0.22 : 0.58, height: 0.22, depth: z === 0 ? 0.22 : 0.58 },
          new Vector3(x, 2.2, z),
          this.material('mission-vacuole-support-material', '#63d7ef'),
        );
      }
    }
    evidence.setEnabled(observed);
    return {
      root,
      fallback,
      evidence,
      key: `${anchor.x},${anchor.y},${anchor.z}:asset-v1`,
      assetAttached: false,
    };
  }

  private requestPrefabAsset(id: PlaceableStructureId, visual: PrefabVisual): void {
    void this.prefabAssets
      .replaceFallback(
        id,
        visual.root,
        visual.fallback,
        () => !this.disposed && this.prefabVisuals.get(id) === visual,
      )
      .then((attached) => {
        if (!attached || this.disposed || this.prefabVisuals.get(id) !== visual) return;
        visual.assetAttached = true;
        if (!this.renderLoopRunning) this.renderStaticFrame();
        this.emitSnapshot();
      });
  }

  private disposePrefabVisual(id: PlaceableStructureId, visual: PrefabVisual): void {
    if (visual.assetAttached) this.prefabAssets.releaseInstance();
    visual.root.dispose(false, false);
    if (this.prefabVisuals.get(id) === visual) this.prefabVisuals.delete(id);
  }

  private reconcilePrefabs(snapshot: Readonly<VoxelMissionSnapshotV1>): void {
    for (const id of MISSION_STRUCTURE_ORDER) {
      const anchor = snapshot.placements[id];
      const observed = snapshot.functionEvidence[id] === true;
      const existing = this.prefabVisuals.get(id);
      if (!anchor) {
        if (existing) this.disposePrefabVisual(id, existing);
        continue;
      }
      const key = `${anchor.x},${anchor.y},${anchor.z}:asset-v1`;
      if (existing?.key !== key) {
        if (existing) this.disposePrefabVisual(id, existing);
        const visual = this.createPrefabVisual(id, anchor, observed);
        this.prefabVisuals.set(id, visual);
        this.requestPrefabAsset(id, visual);
      }
      this.prefabVisuals.get(id)?.evidence.setEnabled(observed);
      if (id === 'centralVacuole') {
        const visual = this.prefabVisuals.get(id);
        const depleted =
          snapshot.homeostasis.droughtStarted && !snapshot.homeostasis.recoveryRestored;
        visual?.root.scaling.set(1, depleted ? 0.48 : 1, 1);
      }
    }
  }

  private moduleMaterial(id: MissionModuleId): StandardMaterial {
    const colors: Record<MissionModuleId, [string, string, string]> = {
      cellWall: ['#648f47', '#91b963', '#35562d'],
      cellMembrane: ['#4ba8b6', '#8bd2d4', '#286a75'],
      nucleus: ['#8955ae', '#b47bd2', '#573575'],
      ribosomes: ['#f2eee6', '#ffffff', '#8c8981'],
      mitochondria: ['#df704f', '#ff9a6f', '#8c3c31'],
      chloroplasts: ['#4f9a4e', '#76c15f', '#285f34'],
      centralVacuole: ['#53b6cf', '#8fe3ef', '#2a7f9a'],
    };
    return this.pixelMaterial(`mission-module-${id}`, colors[id], 0.94);
  }

  private reconcilePickups(snapshot: Readonly<VoxelMissionSnapshotV1>): void {
    const active = new Set(snapshot.activeModulePickups.map((pickup) => pickup.spawnSequence));
    for (const [sequence, mesh] of this.pickupMeshes) {
      if (active.has(sequence)) continue;
      mesh.dispose(false, false);
      this.pickupMeshes.delete(sequence);
    }
    snapshot.activeModulePickups.forEach((pickup) => {
      let mesh = this.pickupMeshes.get(pickup.spawnSequence);
      if (!mesh) {
        mesh = CreateBox(`mission-pickup-${pickup.spawnSequence}`, { size: 0.62 }, this.scene);
        mesh.isPickable = false;
        mesh.material = this.moduleMaterial(pickup.item);
        this.pickupMeshes.set(pickup.spawnSequence, mesh);
      }
      mesh.position.set(pickup.position.x, pickup.position.y, pickup.position.z);
      mesh.setEnabled(!this.overview);
    });
  }

  private reconcileLabels(snapshot: Readonly<VoxelMissionSnapshotV1>): void {
    const active = new Set(activeMissionSupplies(snapshot));
    const depleted = snapshot.homeostasis.droughtStarted && !snapshot.homeostasis.recoveryRestored;
    for (const [rawId, visual] of this.supplyLabels) {
      const id = rawId as MissionModuleId | 'cytoplasm' | 'waterStation' | 'plantStatus';
      const base =
        id === 'cytoplasm'
          ? 'Cytoplasm control'
          : id === 'waterStation'
            ? 'Water availability station'
            : id === 'plantStatus'
              ? `Plant condition: ${depleted ? 'wilted' : 'firm'}`
              : STRUCTURE_LABELS[id];
      const isActive =
        id === 'cytoplasm'
          ? snapshot.boundary.wallAnchors.length === 6 &&
            snapshot.boundary.membraneAnchors.length === 6 &&
            !snapshot.boundary.functionEvidence.cytoplasm
          : id === 'waterStation'
            ? (allInternalEvidenceForScene(snapshot) && !snapshot.homeostasis.droughtStarted) ||
              (snapshot.homeostasis.droughtObserved && !snapshot.homeostasis.recoveryRestored)
            : id === 'plantStatus'
              ? depleted || snapshot.homeostasis.recoveryRestored
              : active.has(id);
      this.drawLabel(rawId, isActive ? `NEXT: ${base}` : base);
      visual.material.emissiveColor = Color3.FromHexString(isActive ? '#f4d35e' : '#ffffff');
      visual.mesh.scaling.setAll(isActive ? 1.12 : 1);
      visual.mesh.setEnabled(isActive && !this.overview);
    }
    this.plantIndicatorRoot.rotation.z = depleted ? 0.92 : 0;
    this.plantIndicatorRoot.scaling.set(1.35, depleted ? 0.7 : 1.35, 1.35);
  }

  private reconcileTool(snapshot: Readonly<VoxelMissionSnapshotV1>): void {
    const selected = snapshot.selectedHotbarItem;
    this.pickRoot.setEnabled(selected === 'builder-pick');
    this.heldModule.setEnabled(selected !== 'builder-pick');
    if (selected !== 'builder-pick') this.heldModule.material = this.moduleMaterial(selected);
  }

  private reconcileSnapshot(): void {
    const snapshot = this.runtime.peek();
    this.cytoplasmFill.setEnabled(snapshot.boundary.cytoplasm === 'filled');
    const cytoplasmMaterial = this.cytoplasmFill.material as StandardMaterial;
    cytoplasmMaterial.alpha = this.overview ? 0.055 : 0.14;
    cytoplasmMaterial.emissiveColor = Color3.FromHexString(
      snapshot.boundary.functionEvidence.cytoplasm ? '#806d2f' : '#514a27',
    );
    this.wallEvidenceRoot.setEnabled(snapshot.boundary.functionEvidence.cellWall);
    this.membraneEvidenceRoot.setEnabled(snapshot.boundary.functionEvidence.cellMembrane);
    this.reconcilePrefabs(snapshot);
    this.reconcilePickups(snapshot);
    this.reconcileLabels(snapshot);
    this.reconcileTool(snapshot);
    this.setOverviewPresentation(this.overview);
  }

  private setOverviewPresentation(enabled: boolean): void {
    this.toolRoot.setEnabled(!enabled);
    this.targetOutline.setEnabled(false);
    this.invalidCross.setEnabled(false);
    for (const [id, visual] of this.supplyLabels) {
      if (!enabled) continue;
      visual.mesh.setEnabled(id === 'plantStatus');
      if (id === 'plantStatus') {
        const snapshot = this.runtime.peek();
        const wilted =
          snapshot.homeostasis.droughtStarted && !snapshot.homeostasis.recoveryRestored;
        this.drawLabel(id, wilted ? 'WILTED PLANT ↓' : 'FIRM PLANT ↑');
      }
    }
    for (const pickup of this.pickupMeshes.values()) pickup.setEnabled(!enabled);
    const cytoplasmMaterial = this.cytoplasmFill.material as StandardMaterial;
    cytoplasmMaterial.alpha = enabled ? 0.055 : 0.14;
    if (!enabled) this.reconcileLabels(this.runtime.peek());
  }

  private attachInput(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('lostpointercapture', this.handlePointerUp);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.paused || this.stopped || this.overview) return;
    if (
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        event.code,
      )
    ) {
      event.preventDefault();
    }
    this.keys.add(event.code);
    if (event.code === 'Digit1') this.selectItem('builder-pick');
    const module = MISSION_MODULE_IDS_FOR_HOTBAR[event.code];
    if (module) this.selectItem(module);
    if (event.code === 'KeyF' && !event.repeat) this.setActionHeld(true);
    if (event.code === 'KeyE' && !event.repeat) this.action();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (event.code === 'KeyF') this.setActionHeld(false);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null || this.paused || this.stopped || this.overview) return;
    this.pointerId = event.pointerId;
    this.pointerPoint = { x: event.clientX, y: event.clientY };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers do not always create capture state.
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || this.paused || this.stopped || this.overview) return;
    const dx = event.clientX - this.pointerPoint.x;
    const dy = event.clientY - this.pointerPoint.y;
    this.pointerPoint = { x: event.clientX, y: event.clientY };
    this.camera.rotation.y += dx * 0.0036;
    this.camera.rotation.x = Math.max(-0.86, Math.min(0.72, this.camera.rotation.x + dy * 0.0032));
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    try {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The browser may already have released capture.
    }
    this.pointerId = null;
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.contextLost) return;
    this.contextLost = true;
    this.stopped = true;
    this.paused = true;
    this.runtime.stopForContextLoss();
    this.clearInput();
    this.stopRenderLoop();
    this.clearOverviewSurface();
    this.callbacks.onContextLost();
    this.emitSnapshot();
  };

  private readonly renderLoop = (): void => this.render();

  private startRenderLoop(): void {
    if (
      this.renderLoopRunning ||
      this.disposed ||
      this.contextLost ||
      this.stopped ||
      this.paused ||
      this.overview
    ) {
      return;
    }
    this.lastTime = performance.now();
    this.performanceRecorder?.resetAnimatedFrameBaseline();
    this.renderLoopRunning = true;
    this.engine.runRenderLoop(this.renderLoop);
  }

  private stopRenderLoop(): void {
    if (!this.renderLoopRunning) return;
    this.engine.stopRenderLoop(this.renderLoop);
    this.renderLoopRunning = false;
    this.performanceRecorder?.resetAnimatedFrameBaseline();
  }

  private renderStaticFrame(): void {
    if (this.disposed || this.contextLost) return;
    const startedAt = performance.now();
    this.scene.render();
    if (this.overview) this.captureOverviewSurface();
    const finishedAt = performance.now();
    this.performanceRecorder?.recordFrame(startedAt, finishedAt, true, this.overview);
    this.requestPerformanceInstrumentation();
    this.refreshPerformanceDiagnostics(finishedAt);
  }

  private captureOverviewSurface(): void {
    const host = this.canvas.parentElement;
    if (!host) return;
    try {
      const snapshot = this.canvas.toDataURL('image/png');
      if (!snapshot.startsWith('data:image/png;base64,') || snapshot.length < 1_000) {
        host.dataset.overviewSurface = 'unavailable';
        return;
      }
      host.style.backgroundImage = `url("${snapshot}")`;
      host.style.backgroundPosition = 'center';
      host.style.backgroundRepeat = 'no-repeat';
      host.style.backgroundSize = '100% 100%';
      host.dataset.overviewSurface = 'ready';
      const base64 = snapshot.slice(snapshot.indexOf(',') + 1);
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
      host.dataset.overviewSurfacePngBytes = String(Math.floor((base64.length * 3) / 4) - padding);
    } catch {
      host.dataset.overviewSurface = 'unavailable';
      delete host.dataset.overviewSurfacePngBytes;
    }
  }

  private clearOverviewSurface(): void {
    const host = this.canvas.parentElement;
    if (!host) return;
    host.style.removeProperty('background-image');
    host.style.removeProperty('background-position');
    host.style.removeProperty('background-repeat');
    host.style.removeProperty('background-size');
    delete host.dataset.overviewSurface;
    delete host.dataset.overviewSurfacePngBytes;
  }

  private render(): void {
    if (this.disposed) return;
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (!this.paused && !this.stopped && !this.overview) {
      this.updateMovement(deltaSeconds);
      this.syncLookToRuntime();
      this.targetTick += deltaSeconds;
      this.snapshotTick += deltaSeconds;
      if (this.targetTick >= TARGET_INTERVAL) {
        this.targetTick = 0;
        this.updateTarget();
      }
      this.updateHeldAction(deltaSeconds);
      this.updatePickupVisuals(now);
      this.updateTool(deltaSeconds);
      if (this.snapshotTick >= SNAPSHOT_INTERVAL) {
        this.snapshotTick = 0;
        this.emitSnapshot();
      }
      this.worldRenderer.flushDirtyRegions(2);
    }
    if (now - this.lastFpsUpdate >= 500) {
      this.lastFpsUpdate = now;
      const fps = this.engine.getFps();
      this.fps = Number.isFinite(fps) ? Math.round(fps) : 0;
      this.emitSnapshot();
    }
    const renderStartedAt = performance.now();
    this.scene.render();
    const renderFinishedAt = performance.now();
    this.performanceRecorder?.recordFrame(renderStartedAt, renderFinishedAt, false, false);
    this.requestPerformanceInstrumentation();
    if (renderFinishedAt - this.lastPerformanceRefresh >= 500) {
      this.refreshPerformanceDiagnostics(renderFinishedAt);
    }
  }

  private updateMovement(deltaSeconds: number): void {
    const keyboardX =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const keyboardZ =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const inputX = Math.max(-1, Math.min(1, keyboardX + this.joystick.x));
    const inputZ = Math.max(-1, Math.min(1, keyboardZ + this.joystick.z));
    if (Math.abs(inputX) + Math.abs(inputZ) < 0.01) return;
    const forward = this.camera.getForwardRay().direction;
    forward.y = 0;
    forward.normalize();
    const right = new Vector3(-forward.z, 0, forward.x);
    const movement = forward.scale(inputZ).add(right.scale(inputX));
    if (movement.lengthSquared() > 1) movement.normalize();
    movement.scaleInPlace(deltaSeconds * PLAYER_SPEED);
    const snapshot = this.runtime.peek();
    const result = movePlayer(
      this.collisionWorld,
      snapshot.player,
      { x: movement.x, z: movement.z },
      { stepHeight: 0.55, maxSubstep: 0.18 },
    );
    const player = {
      ...result.position,
      yaw: this.camera.rotation.y,
      pitch: this.camera.rotation.x,
    };
    this.runtime.updatePlayerFrame(player);
    this.camera.position.set(player.x, player.y + EYE_HEIGHT, player.z);
  }

  private syncLookToRuntime(): void {
    const player = this.runtime.peek().player;
    if (
      Math.abs(player.yaw - this.camera.rotation.y) < 1e-6 &&
      Math.abs(player.pitch - this.camera.rotation.x) < 1e-6
    ) {
      return;
    }
    this.runtime.updatePlayerFrame({
      ...player,
      yaw: this.camera.rotation.y,
      pitch: this.camera.rotation.x,
    });
  }

  private pickupRayTarget(
    snapshot: Readonly<VoxelMissionSnapshotV1>,
    origin: Vector3,
    direction: Vector3,
  ): Extract<MissionTarget, { kind: 'pickup' }> | null {
    let best: Extract<MissionTarget, { kind: 'pickup' }> | null = null;
    for (const pickup of snapshot.activeModulePickups) {
      const distance = rayBoxDistance(origin, direction, pickup.position, 0.42);
      if (distance === null || (best && distance >= best.distance)) continue;
      best = {
        kind: 'pickup',
        snapshotRevision: snapshot.revision,
        spawnSequence: pickup.spawnSequence,
        item: pickup.item,
        distance,
      };
    }
    return best;
  }

  private targetFromHit(
    snapshot: Readonly<VoxelMissionSnapshotV1>,
    hit: VoxelRaycastHit,
  ): MissionTarget | null {
    if (snapshot.selectedHotbarItem !== 'builder-pick') {
      return {
        kind: 'voxel',
        snapshotRevision: snapshot.revision,
        position: { ...hit.cell },
        normal: { ...hit.normal },
        distance: hit.distance,
      };
    }
    const owner = missionWorldOwnerAt(snapshot as VoxelMissionSnapshotV1, hit.cell);
    if (!owner) return null;
    if (owner.kind === 'supply') {
      return {
        kind: 'supply',
        snapshotRevision: snapshot.revision,
        structureId: owner.structureId,
        distance: hit.distance,
      };
    }
    if (owner.kind === 'cytoplasm-control') {
      return {
        kind: 'supply',
        snapshotRevision: snapshot.revision,
        structureId: 'cytoplasm',
        distance: hit.distance,
      };
    }
    if (owner.kind === 'water-station') {
      return {
        kind: 'waterStation',
        snapshotRevision: snapshot.revision,
        distance: hit.distance,
      };
    }
    if (owner.kind === 'boundary') {
      return {
        kind: 'boundary',
        snapshotRevision: snapshot.revision,
        layer: owner.layer,
        sectorId: owner.sector.id,
        distance: hit.distance,
      };
    }
    return {
      kind: 'structure',
      snapshotRevision: snapshot.revision,
      structureId: owner.structureId,
      distance: hit.distance,
    };
  }

  private resolveTarget(): MissionTarget | null {
    const snapshot = this.runtime.peek();
    const origin = this.camera.position.clone();
    const direction = this.camera.getForwardRay().direction.normalize();
    const hit = raycastVoxel(
      this.collisionWorld,
      { x: origin.x, y: origin.y, z: origin.z },
      { x: direction.x, y: direction.y, z: direction.z },
      { maxDistance: 5, maxSteps: 64 },
    );
    this.currentHit = hit;
    const pickup = this.pickupRayTarget(snapshot, origin, direction);
    if (pickup && (!hit || pickup.distance < hit.distance)) return pickup;
    return hit ? this.targetFromHit(snapshot, hit) : null;
  }

  private updateTarget(): void {
    const snapshot = this.runtime.peek();
    this.currentTarget = this.resolveTarget();
    this.currentViewModel = selectMissionViewModel(
      snapshot as VoxelMissionSnapshotV1,
      this.currentTarget,
    );
    this.placementValid = false;
    this.cameraClearanceBlocked = false;
    if (this.currentTarget?.kind === 'voxel' && snapshot.selectedHotbarItem !== 'builder-pick') {
      const preview = executeMissionCommand(
        snapshot as VoxelMissionSnapshotV1,
        { type: 'place', snapshotRevision: snapshot.revision },
        this.currentTarget,
        this.collisionWorld,
      );
      this.placementValid = preview !== snapshot;
      if (!this.placementValid && isPlaceableStructureId(snapshot.selectedHotbarItem)) {
        const destination = {
          x: this.currentTarget.position.x + this.currentTarget.normal.x,
          y: this.currentTarget.position.y + this.currentTarget.normal.y,
          z: this.currentTarget.position.z + this.currentTarget.normal.z,
        };
        const id = snapshot.selectedHotbarItem;
        const candidatePlacements = { ...snapshot.placements, [id]: destination };
        this.cameraClearanceBlocked =
          destination.y === 1 &&
          validatePrefabPlacements(candidatePlacements).valid &&
          validatePrefabPlayerSafety(candidatePlacements, snapshot.player).valid &&
          !validatePrefabCameraClearance(id, destination, snapshot.player).valid;
      }
      this.currentViewModel = {
        ...this.currentViewModel,
        primaryActionEnabled: this.placementValid,
      };
    }
    this.targetLabel = this.targetText(snapshot, this.currentTarget);
    this.updateTargetMarker(snapshot);
  }

  private targetText(
    snapshot: Readonly<VoxelMissionSnapshotV1>,
    target: MissionTarget | null,
  ): string {
    if (!target) return '';
    if (target.kind === 'pickup') return `${STRUCTURE_LABELS[target.item]} DROP · COLLECT`;
    if (target.kind === 'supply') {
      if (target.structureId === 'cytoplasm') {
        return snapshot.boundary.cytoplasm === 'filled'
          ? 'CYTOPLASM FULL-HEIGHT FILL · INSPECT'
          : 'CYTOPLASM CONTROL · ACTIVATE';
      }
      return `${STRUCTURE_LABELS[target.structureId]} SUPPLY · HOLD MINE`;
    }
    if (target.kind === 'boundary') {
      return `${target.layer === 'cellWall' ? 'OUTER CELL WALL' : 'INNER CELL MEMBRANE'} · ${this.currentViewModel.primaryActionLabel.toUpperCase()}`;
    }
    if (target.kind === 'structure') {
      return `${STRUCTURE_LABELS[target.structureId].toUpperCase()} · ${this.currentViewModel.primaryActionLabel.toUpperCase()}`;
    }
    if (target.kind === 'waterStation') {
      return `WATER AVAILABILITY STATION · ${this.currentViewModel.primaryActionLabel.toUpperCase()}`;
    }
    return this.placementValid
      ? `VALID ${STRUCTURE_LABELS[snapshot.selectedHotbarItem as MissionModuleId].toUpperCase()} LOCATION · PLACE`
      : this.cameraClearanceBlocked
        ? 'STEP BACK TO PLACE · KEEP THE CAMERA CLEAR'
        : 'BLOCKED LOCATION × MOVE THE CROSSHAIR';
  }

  private updateTargetMarker(snapshot: Readonly<VoxelMissionSnapshotV1>): void {
    let point: VoxelPoint | null = this.currentHit?.cell ?? null;
    const target = this.currentTarget;
    if (target?.kind === 'pickup') {
      const spawnSequence = target.spawnSequence;
      point =
        snapshot.activeModulePickups.find((pickup) => pickup.spawnSequence === spawnSequence)
          ?.position ?? null;
    }
    if (!point) {
      this.targetOutline.setEnabled(false);
      this.invalidCross.setEnabled(false);
      return;
    }
    this.targetOutline.position.set(point.x, point.y, point.z);
    const invalidPlacement =
      this.currentTarget?.kind === 'voxel' &&
      snapshot.selectedHotbarItem !== 'builder-pick' &&
      !this.placementValid;
    this.outlineMaterial.diffuseColor = Color3.FromHexString(
      invalidPlacement ? '#ff755f' : '#efff8a',
    );
    this.outlineMaterial.emissiveColor = Color3.FromHexString(
      invalidPlacement ? '#9b2e25' : '#8eb83f',
    );
    this.targetOutline.setEnabled(true);
    this.invalidCross.position.set(point.x, point.y, point.z);
    this.invalidCross.setEnabled(invalidPlacement);
  }

  private updateHeldAction(deltaSeconds: number): void {
    if (!this.actionHeld) return;
    this.actionProgress += deltaSeconds;
    this.swingTime = 0.24;
    if (this.actionProgress < 0.72) return;
    const verb = this.currentViewModel.primaryVerb;
    this.actionHeld = false;
    this.actionProgress = 0;
    if (verb === 'mine' || verb === 'remove') this.dispatchVerb(verb);
  }

  private updatePickupVisuals(now: number): void {
    const snapshot = this.runtime.peek();
    snapshot.activeModulePickups.forEach((pickup, index) => {
      const mesh = this.pickupMeshes.get(pickup.spawnSequence);
      if (!mesh) return;
      const bob = this.reducedMotion ? 0 : Math.sin(now * 0.004 + index * 0.71) * 0.1;
      mesh.position.y = pickup.position.y + bob;
      if (!this.reducedMotion) mesh.rotation.y += 0.018;
    });
  }

  private updateTool(deltaSeconds: number): void {
    if (this.reducedMotion) {
      this.swingTime = 0;
      this.toolRoot.rotation.x = -0.2;
      this.toolRoot.rotation.z = -0.18;
      return;
    }
    if (this.swingTime <= 0) {
      this.toolRoot.rotation.x += (-0.2 - this.toolRoot.rotation.x) * 0.18;
      this.toolRoot.rotation.z += (-0.18 - this.toolRoot.rotation.z) * 0.18;
      return;
    }
    this.swingTime = Math.max(0, this.swingTime - deltaSeconds);
    const progress = 1 - this.swingTime / 0.24;
    const arc = Math.sin(progress * Math.PI);
    this.toolRoot.rotation.x = -0.2 - arc * 0.72;
    this.toolRoot.rotation.z = -0.18 + arc * 0.4;
  }

  private dispatchVerb(type: MissionCommand['type']): void {
    if (this.paused || this.stopped || this.overview) return;
    const snapshot = this.runtime.peek();
    const target = this.resolveTarget();
    let view = selectMissionViewModel(snapshot as VoxelMissionSnapshotV1, target);
    if (target?.kind === 'voxel' && snapshot.selectedHotbarItem !== 'builder-pick') {
      const preview = executeMissionCommand(
        snapshot as VoxelMissionSnapshotV1,
        { type: 'place', snapshotRevision: snapshot.revision },
        target,
        this.collisionWorld,
      );
      view = { ...view, primaryActionEnabled: preview !== snapshot };
    }
    if (view.primaryVerb !== type || !view.primaryActionEnabled) {
      this.updateTarget();
      this.emitSnapshot();
      return;
    }
    const previousRevision = snapshot.revision;
    this.swingTime = 0.24;
    this.runtime.dispatch({ type, snapshotRevision: snapshot.revision }, target);
    if (this.runtime.peek().revision === previousRevision) {
      this.updateTarget();
      this.emitSnapshot();
      return;
    }
    syncMissionWorld(this.renderWorld, this.runtime.peek() as VoxelMissionSnapshotV1, false);
    syncMissionWorld(this.collisionWorld, this.runtime.peek() as VoxelMissionSnapshotV1, true);
    this.worldRenderer.flushDirtyRegions(Number.POSITIVE_INFINITY);
    this.reconcileSnapshot();
    this.updateTarget();
    this.emitSnapshot();
  }

  private recenterPoint(snapshot: Readonly<VoxelMissionSnapshotV1>): VoxelPoint | null {
    const recovery = snapshot.correction.recovery;
    if (recovery?.kind === 'pickup') {
      const spawnSequence = recovery.spawnSequence;
      return (
        snapshot.activeModulePickups.find((pickup) => pickup.spawnSequence === spawnSequence)
          ?.position ?? null
      );
    }
    const activePickup = snapshot.activeModulePickups[0];
    if (activePickup) return activePickup.position;
    const selected = snapshot.selectedHotbarItem;
    if (selected !== 'builder-pick' && snapshot.moduleInventory[selected] > 0) {
      if (selected === 'cellWall' || selected === 'cellMembrane') {
        const sector = nextBoundarySector(snapshot.boundary, selected);
        return sector ? (selected === 'cellWall' ? sector.wallBacking : sector.wallAnchor) : null;
      }
      const anchor = MISSION_RECOMMENDED_PREFAB_ANCHORS[selected];
      if (selected === 'centralVacuole') {
        const player = snapshot.player;
        if (
          player.z > 0.6 &&
          Math.hypot(
            player.x - CENTRAL_VACUOLE_ENTRY_WAYPOINT.x,
            player.z - CENTRAL_VACUOLE_ENTRY_WAYPOINT.z,
          ) > 0.55
        ) {
          return { ...CENTRAL_VACUOLE_ENTRY_WAYPOINT };
        }
        if (
          Math.hypot(
            player.x - CENTRAL_VACUOLE_SIDE_WAYPOINT.x,
            player.z - CENTRAL_VACUOLE_SIDE_WAYPOINT.z,
          ) > 0.55
        ) {
          return { ...CENTRAL_VACUOLE_SIDE_WAYPOINT };
        }
      }
      return { x: anchor.x, y: 0.5, z: anchor.z };
    }
    if (snapshot.boundary.wallAnchors.length < 6) return MISSION_SUPPLY_CELLS.cellWall;
    if (!snapshot.boundary.functionEvidence.cellWall) return BOUNDARY_SECTORS[0].wallAnchor;
    if (snapshot.boundary.membraneAnchors.length < 6) return MISSION_SUPPLY_CELLS.cellMembrane;
    if (!snapshot.boundary.functionEvidence.cellMembrane) {
      return BOUNDARY_SECTORS[0].membraneAnchor;
    }
    if (snapshot.boundary.cytoplasm === 'empty' || !snapshot.boundary.functionEvidence.cytoplasm) {
      return CYTOPLASM_CONTROL_CELL;
    }
    const unobserved = MISSION_STRUCTURE_ORDER.find(
      (id) => snapshot.placements[id] && !snapshot.functionEvidence[id],
    );
    if (unobserved) {
      const anchor = snapshot.placements[unobserved]!;
      return {
        x: anchor.x + (unobserved === 'centralVacuole' ? 1 : 0.5),
        y: 2,
        z: anchor.z + (unobserved === 'centralVacuole' ? 1 : 0.5),
      };
    }
    const supply = activeMissionSupplies(snapshot)[0];
    if (supply) return MISSION_SUPPLY_CELLS[supply];
    if (
      allInternalEvidenceForScene(snapshot) &&
      (!snapshot.homeostasis.droughtStarted ||
        (snapshot.homeostasis.droughtObserved && !snapshot.homeostasis.recoveryRestored))
    ) {
      return WATER_STATION_CELL;
    }
    const vacuole = snapshot.placements.centralVacuole;
    return vacuole ? { x: vacuole.x + 1, y: 2, z: vacuole.z + 1 } : null;
  }

  setJoystick(x: number, z: number): void {
    if (this.paused || this.stopped || this.overview) {
      this.joystick = { x: 0, z: 0 };
      return;
    }
    this.joystick = {
      x: Math.max(-1, Math.min(1, x)),
      z: Math.max(-1, Math.min(1, z)),
    };
  }

  setActionHeld(active: boolean): void {
    if (this.paused || this.stopped || this.overview) return;
    if (!active) {
      this.actionHeld = false;
      this.actionProgress = 0;
      return;
    }
    this.updateTarget();
    if (
      !this.currentViewModel.primaryActionEnabled ||
      (this.currentViewModel.primaryVerb !== 'mine' &&
        this.currentViewModel.primaryVerb !== 'remove')
    ) {
      return;
    }
    this.actionHeld = true;
    this.actionProgress = 0;
    this.swingTime = 0.24;
    this.emitSnapshot();
  }

  action(): void {
    if (this.paused || this.stopped || this.overview) return;
    this.updateTarget();
    const verb = this.currentViewModel.primaryVerb;
    if (!verb || verb === 'mine' || verb === 'remove') return;
    this.dispatchVerb(verb);
  }

  selectItem(item: MissionHotbarItemId): void {
    if (this.paused || this.stopped || this.overview) return;
    const before = this.runtime.peek().revision;
    this.runtime.selectItem(item);
    if (this.runtime.peek().revision === before) return;
    this.reconcileTool(this.runtime.peek());
    this.updateTarget();
    this.emitSnapshot();
  }

  recenter(): void {
    if (this.paused || this.stopped) return;
    if (this.overview) this.toggleOverview();
    const target = this.recenterPoint(this.runtime.peek());
    this.lastRecenterPoint = target ? { ...target } : null;
    const snapshotBeforeLook = this.runtime.peek();
    if (
      snapshotBeforeLook.selectedHotbarItem === 'centralVacuole' &&
      snapshotBeforeLook.moduleInventory.centralVacuole > 0 &&
      target
    ) {
      this.lastRecenterStage =
        target.x === CENTRAL_VACUOLE_ENTRY_WAYPOINT.x &&
        target.z === CENTRAL_VACUOLE_ENTRY_WAYPOINT.z
          ? 'central-entry'
          : target.x === CENTRAL_VACUOLE_SIDE_WAYPOINT.x &&
              target.z === CENTRAL_VACUOLE_SIDE_WAYPOINT.z
            ? 'central-side'
            : 'central-anchor';
    } else {
      this.lastRecenterStage = 'normal';
    }
    if (target) this.camera.setTarget(new Vector3(target.x, target.y, target.z));
    const snapshot = this.runtime.peek();
    this.runtime.updatePlayerFrame({
      ...snapshot.player,
      yaw: this.camera.rotation.y,
      pitch: this.camera.rotation.x,
    });
    this.updateTarget();
    this.emitSnapshot();
  }

  toggleOverview(): void {
    if (this.paused || this.stopped) return;
    if (!this.overview) {
      this.clearInput();
      const before = this.runtime.peek().revision;
      this.runtime.dispatch(
        { type: 'overview', snapshotRevision: this.runtime.peek().revision },
        null,
      );
      if (this.runtime.peek().revision !== before) {
        syncMissionWorld(this.renderWorld, this.runtime.peek() as VoxelMissionSnapshotV1, false);
        syncMissionWorld(this.collisionWorld, this.runtime.peek() as VoxelMissionSnapshotV1, true);
        this.reconcileSnapshot();
        this.updateTarget();
      }
      this.overviewReturn = {
        position: this.camera.position.clone(),
        rotation: this.camera.rotation.clone(),
        fov: this.camera.fov,
      };
      this.overview = true;
      this.camera.position.set(1.4, 16.2, 9.2);
      this.camera.fov = 1.03;
      this.camera.setTarget(new Vector3(0.8, 1.15, -1.4));
      this.setOverviewPresentation(true);
      this.stopRenderLoop();
      this.renderStaticFrame();
    } else if (this.overviewReturn) {
      this.clearOverviewSurface();
      this.camera.position.copyFrom(this.overviewReturn.position);
      this.camera.rotation.copyFrom(this.overviewReturn.rotation);
      this.camera.fov = this.overviewReturn.fov;
      this.overview = false;
      this.overviewReturn = null;
      this.setOverviewPresentation(false);
      this.updateTarget();
      this.startRenderLoop();
    }
    this.emitSnapshot();
  }

  setPaused(paused: boolean): void {
    if (this.stopped) return;
    this.clearInput();
    this.paused = paused;
    if (paused) {
      this.stopRenderLoop();
      this.renderStaticFrame();
    } else {
      this.startRenderLoop();
    }
    this.emitSnapshot();
  }

  clearInput(): void {
    this.keys.clear();
    this.joystick = { x: 0, z: 0 };
    this.actionHeld = false;
    this.actionProgress = 0;
    this.swingTime = 0;
    this.toolRoot.rotation.x = -0.2;
    this.toolRoot.rotation.z = -0.18;
    if (this.pointerId !== null) {
      try {
        if (this.canvas.hasPointerCapture(this.pointerId)) {
          this.canvas.releasePointerCapture(this.pointerId);
        }
      } catch {
        // Capture may already be gone after blur or orientation change.
      }
    }
    this.pointerId = null;
  }

  private emitSnapshot(): void {
    const snapshot = this.runtime.current();
    const renderer = this.worldRenderer.stats();
    const assets = this.prefabAssets.stats();
    this.callbacks.onSnapshot({
      mission: snapshot,
      target: this.currentTarget ? structuredClone(this.currentTarget) : null,
      targetLabel: this.targetLabel,
      viewModel: structuredClone(this.currentViewModel),
      score: this.runtime.score().total,
      fps: this.fps,
      diagnostics: {
        world: '24x12x24',
        revision: snapshot.revision,
        playerCell: pointLabel({
          x: Math.round(snapshot.player.x),
          y: Math.round(snapshot.player.y),
          z: Math.round(snapshot.player.z),
        }),
        playerPosition: `${snapshot.player.x.toFixed(3)},${snapshot.player.y.toFixed(3)},${snapshot.player.z.toFixed(3)}`,
        recenterCell: pointLabel(this.lastRecenterPoint),
        recenterStage: this.lastRecenterStage,
        targetKind: this.currentTarget?.kind ?? 'none',
        targetCell: pointLabel(this.currentHit?.cell ?? null),
        targetFace: faceLabel(this.currentHit?.normal ?? null),
        placementValid: this.placementValid,
        pickupsActive: snapshot.activeModulePickups.length,
        prefabCount: Object.keys(snapshot.placements).length,
        regionMeshes: renderer.regionMeshCount,
        totalRegionRebuilds: renderer.totalRebuilds,
        actionHeld: this.actionHeld,
        actionProgress: this.actionProgress,
        paused: this.paused,
        overview: this.overview,
        contextLost: this.contextLost,
        quality: this.presentation.quality,
        renderWidth: this.engine.getRenderWidth(),
        renderHeight: this.engine.getRenderHeight(),
        renderLoopActive: this.renderLoopRunning,
        assetRequests: assets.requests,
        assetFailures: assets.failures,
        assetInstances: assets.activeInstances,
        cytoplasmSolidCells: 0,
        storageWrites: 0,
        apiRequests: 0,
      },
    });
  }

  private refreshPerformanceDiagnostics(at = performance.now()): void {
    if (!this.performanceRecorder || this.disposed) return;
    const assets = this.prefabAssets.stats();
    this.performanceSnapshot = this.performanceRecorder.snapshot({
      instrumentationReady: this.sceneInstrumentation !== null,
      instrumentationError: this.performanceInstrumentationError,
      renderWidth: this.engine.getRenderWidth(),
      renderHeight: this.engine.getRenderHeight(),
      hardwareScalingLevel: this.engine.getHardwareScalingLevel(),
      renderLoopActive: this.renderLoopRunning,
      drawCalls: this.sceneInstrumentation?.drawCallsCounter.current ?? 0,
      activeMeshes: this.scene.getActiveMeshes().length,
      totalMeshes: this.scene.meshes.length,
      totalVertices: this.scene.getTotalVertices(),
      materials: this.scene.materials.length,
      textures: this.scene.textures.length,
      assetRequests: assets.requests,
      assetFailures: assets.failures,
      pendingAssetLoads: assets.pendingLoads,
      activeAssetInstances: assets.activeInstances,
    });
    this.lastPerformanceRefresh = at;
  }

  performanceDiagnostics(): MissionPerformanceDiagnosticsV1 | null {
    return this.performanceSnapshot ? structuredClone(this.performanceSnapshot) : null;
  }

  resize(): void {
    if (this.disposed || this.contextLost) return;
    this.clearInput();
    this.engine.resize();
    if (!this.renderLoopRunning) this.renderStaticFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearOverviewSurface();
    this.clearInput();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.handlePointerUp);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.stopRenderLoop();
    this.sceneInstrumentation?.dispose();
    this.sceneInstrumentation = null;
    this.performanceRecorder?.dispose();
    this.performanceSnapshot = null;
    this.prefabAssets.dispose();
    this.worldRenderer.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
