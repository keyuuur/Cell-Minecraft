import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera.pure';
import '@babylonjs/core/Culling/ray';
import { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.pure';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.pure';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.pure';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.pure';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.pure';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.pure';
import { Scene } from '@babylonjs/core/scene.pure';
import { VoxelBlock } from '../voxel/blocks';
import { inventoryCount, type HotbarSnapshot } from '../voxel/HotbarInventory';
import { PickupPool, type PickupPoolStats } from '../voxel/PickupPool';
import { movePlayer, playerBodyAt } from '../voxel/PlayerMotor';
import { validateTargetFacePlacement, type PlacementResult } from '../voxel/placement';
import { raycastVoxel, type VoxelRaycastHit } from '../voxel/raycastVoxel';
import { sameVoxel, voxelKey, type VoxelPoint } from '../voxel/types';
import { VoxelWorld } from '../voxel/VoxelWorld';
import { VoxelWorldRenderer } from '../voxel/babylon/VoxelWorldRenderer';
import {
  advanceProofMining,
  cancelProofMining,
  collectProofDrop,
  FOUNDATION_BLOCK_COUNT,
  initialProofState,
  placeProofBlock,
  proofPhase,
  selectProofSlot,
  type ProofPhase,
  type ProofState,
  type ProofTarget,
} from './proofState';
import { commitMinedProofBlock } from './proofDropTransaction';

interface PlacementTarget {
  destination: VoxelPoint;
  backing: VoxelPoint;
  face: 'FRONT' | 'SIDE' | 'TOP';
}

const WORLD_OPTIONS = {
  min: { x: -12, y: 0, z: -12 },
  width: 24,
  height: 12,
  depth: 24,
  regionSize: { x: 8, y: 12, z: 8 },
} as const;
const EYE_HEIGHT = 1.7;
const SUPPLY_CELLS: VoxelPoint[] = [
  { x: -1, y: 1, z: 4 },
  { x: 0, y: 1, z: 4 },
  { x: 1, y: 1, z: 4 },
];
const PLACEMENT_TARGETS: PlacementTarget[] = [
  {
    destination: { x: 0, y: 1, z: -2 },
    backing: { x: 0, y: 1, z: -3 },
    face: 'FRONT',
  },
  {
    destination: { x: -2, y: 1, z: -1 },
    backing: { x: -3, y: 1, z: -1 },
    face: 'SIDE',
  },
  {
    destination: { x: 3, y: 2, z: -1 },
    backing: { x: 3, y: 1, z: -1 },
    face: 'TOP',
  },
];
const SUPPLY_KEYS = new Set(SUPPLY_CELLS.map(voxelKey));

export interface VoxelFoundationDiagnostics {
  world: '24x12x24';
  regionMeshes: number;
  lastRebuiltRegions: string[];
  totalRegionRebuilds: number;
  targetCell: string;
  targetFace: string;
  adjacentCell: string;
  playerCell: string;
  autoSteps: number;
  pickups: PickupPoolStats;
  storageWrites: 0;
  apiRequests: 0;
}

export interface VoxelProofSnapshot {
  state: ProofState;
  phase: ProofPhase;
  target: ProofTarget;
  targetLabel: string;
  fps: number;
  diagnostics: VoxelFoundationDiagnostics;
}

interface VoxelProofCallbacks {
  onSnapshot: (snapshot: VoxelProofSnapshot) => void;
  onContextLost: () => void;
}

function flatMaterial(scene: Scene, name: string, color: string, alpha = 1): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.emissiveColor = Color3.FromHexString(color).scale(alpha < 1 ? 0.24 : 0.04);
  material.specularColor = Color3.Black();
  material.alpha = alpha;
  return material;
}

function pixelMaterial(
  scene: Scene,
  name: string,
  colors: [string, string, string],
): StandardMaterial {
  const texture = new DynamicTexture(
    `${name}-texture`,
    { width: 32, height: 32 },
    scene,
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
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  return material;
}

function thinInstanceBoxes(
  scene: Scene,
  name: string,
  positions: Vector3[],
  material: StandardMaterial,
  dimensions: { width: number; height: number; depth: number },
): Mesh {
  const source = CreateBox(name, dimensions, scene);
  source.material = material;
  source.isPickable = false;
  const matrices: number[] = [];
  for (const position of positions) {
    Matrix.Translation(position.x, position.y, position.z).copyToArray(matrices, matrices.length);
  }
  source.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, true);
  return source;
}

function createEdgeMarker(
  scene: Scene,
  name: string,
  material: StandardMaterial,
  size = 1.08,
  thickness = 0.035,
): TransformNode {
  const root = new TransformNode(name, scene);
  const half = size / 2;
  const edges: Array<{
    dimensions: { width: number; height: number; depth: number };
    position: Vector3;
  }> = [];
  for (const y of [-half, half]) {
    for (const z of [-half, half]) {
      edges.push({
        dimensions: { width: size, height: thickness, depth: thickness },
        position: new Vector3(0, y, z),
      });
    }
  }
  for (const x of [-half, half]) {
    for (const z of [-half, half]) {
      edges.push({
        dimensions: { width: thickness, height: size, depth: thickness },
        position: new Vector3(x, 0, z),
      });
    }
  }
  for (const x of [-half, half]) {
    for (const y of [-half, half]) {
      edges.push({
        dimensions: { width: thickness, height: thickness, depth: size },
        position: new Vector3(x, y, 0),
      });
    }
  }
  edges.forEach((edge, index) => {
    const mesh = CreateBox(`${name}-edge-${index}`, edge.dimensions, scene);
    mesh.parent = root;
    mesh.position.copyFrom(edge.position);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.renderingGroupId = 3;
  });
  return root;
}

function createInvalidCross(scene: Scene, name: string, material: StandardMaterial): TransformNode {
  const root = new TransformNode(name, scene);
  for (const rotation of [-Math.PI / 4, Math.PI / 4]) {
    const front = CreateBox(
      `${name}-front-${rotation}`,
      { width: 1.18, height: 0.065, depth: 0.04 },
      scene,
    );
    front.parent = root;
    front.position.z = 0.56;
    front.rotation.z = rotation;
    front.material = material;
    front.isPickable = false;
    front.renderingGroupId = 3;

    const side = CreateBox(
      `${name}-side-${rotation}`,
      { width: 0.04, height: 0.065, depth: 1.18 },
      scene,
    );
    side.parent = root;
    side.position.x = 0.56;
    side.rotation.x = rotation;
    side.material = material;
    side.isPickable = false;
    side.renderingGroupId = 3;
  }
  return root;
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

export class VoxelProofScene {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: VoxelProofCallbacks;
  private readonly keys = new Set<string>();
  private readonly world: VoxelWorld;
  private readonly worldRenderer: VoxelWorldRenderer;
  private readonly pickupPool = new PickupPool(8);
  private readonly pickupMeshes: Mesh[] = [];
  private readonly anchorGhosts = new Map<string, TransformNode>();
  private readonly installedCells = new Set<string>();
  private readonly toolRoot: TransformNode;
  private readonly pickRoot: TransformNode;
  private readonly heldBlock: Mesh;
  private readonly outline: TransformNode;
  private readonly invalidCross: TransformNode;
  private readonly outlineMaterial: StandardMaterial;
  private readonly invalidMaterial: StandardMaterial;
  private readonly builderMaterial: StandardMaterial;
  private readonly reducedMotion: boolean;
  private state: ProofState = {
    ...initialProofState,
    inventory: {
      ...initialProofState.inventory,
      slots: initialProofState.inventory.slots.map((slot) => ({ ...slot })),
    },
  };
  private playerPosition: VoxelPoint = { x: 0, y: 0.5, z: 9 };
  private joystick = { x: 0, z: 0 };
  private currentTarget: ProofTarget = null;
  private currentHit: VoxelRaycastHit | null = null;
  private placement: PlacementResult = {
    valid: false,
    destination: null,
    failure: 'no-target',
  };
  private targetLabel = '';
  private pointerId: number | null = null;
  private pointerPoint = { x: 0, y: 0 };
  private mineHeld = false;
  private mineTick = 0;
  private targetTick = 0;
  private swingTime = 0;
  private autoSteps = 0;
  private paused = false;
  private stopped = false;
  private disposed = false;
  private lastTime = performance.now();
  private lastFpsUpdate = 0;
  private currentFps = 0;
  private lastRebuiltRegions: string[] = [];

  constructor(canvas: HTMLCanvasElement, callbacks: VoxelProofCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.engine = new Engine(
      canvas,
      true,
      {
        preserveDrawingBuffer: false,
        stencil: false,
        powerPreference: 'high-performance',
        adaptToDeviceRatio: false,
      },
      true,
    );
    this.engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString('#87d6f5ff');
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = Color3.FromHexString('#87d6f5');
    this.scene.fogStart = 19;
    this.scene.fogEnd = 35;
    this.scene.skipPointerMovePicking = true;

    this.camera = new UniversalCamera(
      'voxel-proof-camera',
      new Vector3(this.playerPosition.x, this.playerPosition.y + EYE_HEIGHT, this.playerPosition.z),
      this.scene,
    );
    this.camera.minZ = 0.08;
    this.camera.maxZ = 48;
    this.camera.fov = 1.2;
    this.camera.inputs.clear();
    this.camera.setTarget(new Vector3(0, 1, 4));
    this.scene.activeCamera = this.camera;

    const skyLight = new HemisphericLight(
      'voxel-proof-sky-light',
      new Vector3(0.2, 1, 0.15),
      this.scene,
    );
    skyLight.intensity = 1.18;
    skyLight.groundColor = Color3.FromHexString('#677b5f');
    const sun = new DirectionalLight('voxel-proof-sun', new Vector3(-0.45, -1, 0.3), this.scene);
    sun.intensity = 0.52;

    this.builderMaterial = pixelMaterial(this.scene, 'voxel-proof-builder-block', [
      '#79b85a',
      '#a9d17b',
      '#37653b',
    ]);
    this.world = this.createWorld();
    this.worldRenderer = new VoxelWorldRenderer(this.scene, this.world);
    this.lastRebuiltRegions = this.worldRenderer.buildInitialWorld();
    this.createSkyDecorations();
    this.outlineMaterial = flatMaterial(
      this.scene,
      'voxel-proof-target-outline-material',
      '#fff2b0',
      0.95,
    );
    this.outlineMaterial.disableDepthWrite = true;
    this.outline = createEdgeMarker(this.scene, 'voxel-proof-target-outline', this.outlineMaterial);
    this.outline.setEnabled(false);
    this.invalidMaterial = flatMaterial(
      this.scene,
      'voxel-proof-invalid-cross-material',
      '#ff755f',
      0.96,
    );
    this.invalidMaterial.disableDepthWrite = true;
    this.invalidCross = createInvalidCross(
      this.scene,
      'voxel-proof-invalid-cross',
      this.invalidMaterial,
    );
    this.invalidCross.setEnabled(false);
    this.createAnchorGhosts();
    this.createPickupMeshes();
    const tool = this.createTool();
    this.toolRoot = tool.root;
    this.pickRoot = tool.pick;
    this.heldBlock = tool.heldBlock;
    this.syncHeldItem();
    this.attachInput();

    canvas.addEventListener('webglcontextlost', this.handleContextLost, { passive: false });
    this.engine.runRenderLoop(() => this.render());
    this.emitSnapshot();
  }

  private createWorld(): VoxelWorld {
    const world = new VoxelWorld(WORLD_OPTIONS);
    for (let x = -11; x <= 11; x += 1) {
      for (let z = -11; z <= 11; z += 1) {
        const path = x >= -1 && x <= 1 && z >= -1 && z <= 10;
        const foundation = x >= -4 && x <= 4 && z >= -8 && z <= -3;
        world.set(
          { x, y: 0, z },
          foundation ? VoxelBlock.Foundation : path ? VoxelBlock.Path : VoxelBlock.Grass,
        );
      }
    }
    for (let edge = -11; edge <= 11; edge += 1) {
      for (let y = 1; y <= 3; y += 1) {
        world.set({ x: -11, y, z: edge }, VoxelBlock.Soil);
        world.set({ x: 11, y, z: edge }, VoxelBlock.Soil);
      }
    }
    for (let edge = -10; edge <= 10; edge += 1) {
      world.set({ x: edge, y: 1, z: -11 }, VoxelBlock.Soil);
      world.set({ x: edge, y: 2, z: -11 }, VoxelBlock.Soil);
    }

    // A broad, striped half-step sits directly on the route to the supply stack.
    for (let x = -1; x <= 1; x += 1) {
      world.set({ x, y: 1, z: 6 }, VoxelBlock.Step);
    }
    // A two-block rail proves that the same grid also blocks movement.
    for (let z = 1; z <= 3; z += 1) {
      world.set({ x: 5, y: 1, z }, VoxelBlock.Stone);
      world.set({ x: 5, y: 2, z }, VoxelBlock.Stone);
    }

    for (const cell of SUPPLY_CELLS) world.set(cell, VoxelBlock.Builder);
    for (const target of PLACEMENT_TARGETS) world.set(target.backing, VoxelBlock.Stone);

    for (let z = -8; z <= -3; z += 1) {
      world.set({ x: -5, y: 1, z }, VoxelBlock.Stone);
      world.set({ x: 5, y: 1, z }, VoxelBlock.Stone);
    }
    for (let x = -5; x <= 5; x += 1) world.set({ x, y: 1, z: -9 }, VoxelBlock.Stone);
    for (const [x, z] of [
      [-5, -9],
      [5, -9],
      [-5, -3],
      [5, -3],
    ]) {
      for (let y = 2; y <= 5; y += 1) world.set({ x, y, z }, VoxelBlock.Stone);
    }

    for (const [x, z] of [
      [-8, 2],
      [8, -4],
      [8, 8],
    ]) {
      world.set({ x, y: 1, z }, VoxelBlock.Wood);
      world.set({ x, y: 2, z }, VoxelBlock.Wood);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          world.set({ x: x + dx, y: 3, z: z + dz }, VoxelBlock.Leaves);
        }
      }
      world.set({ x, y: 4, z }, VoxelBlock.Leaves);
    }
    return world;
  }

  private createSkyDecorations(): void {
    const clouds = flatMaterial(this.scene, 'voxel-proof-clouds', '#f4fbff');
    thinInstanceBoxes(
      this.scene,
      'voxel-proof-cloud-blocks',
      [
        new Vector3(-8, 9, -17),
        new Vector3(-6, 9, -17),
        new Vector3(-4, 9, -17),
        new Vector3(6, 11, -20),
        new Vector3(8, 11, -20),
      ],
      clouds,
      { width: 2, height: 0.7, depth: 0.8 },
    );
    const sunMaterial = flatMaterial(this.scene, 'voxel-proof-sun-material', '#ffe59a');
    const sun = CreateBox(
      'voxel-proof-square-sun',
      { width: 2.8, height: 2.8, depth: 0.18 },
      this.scene,
    );
    sun.position = new Vector3(-13, 14, -22);
    sun.material = sunMaterial;
    sun.isPickable = false;
  }

  private createAnchorGhosts(): void {
    const material = flatMaterial(this.scene, 'voxel-proof-bracket-material', '#ffdc75', 0.62);
    material.disableDepthWrite = true;
    for (const target of PLACEMENT_TARGETS) {
      const key = voxelKey(target.destination);
      const ghost = createEdgeMarker(
        this.scene,
        `voxel-proof-bracket-${target.face.toLowerCase()}`,
        material,
        1.04,
        0.026,
      );
      ghost.position.set(target.destination.x, target.destination.y, target.destination.z);
      this.anchorGhosts.set(key, ghost);
    }
    this.syncAnchorGhosts();
  }

  private createPickupMeshes(): void {
    for (let index = 0; index < this.pickupPool.capacity; index += 1) {
      const mesh = CreateBox(`voxel-proof-pooled-drop-${index}`, { size: 0.56 }, this.scene);
      mesh.material = this.builderMaterial;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.pickupMeshes.push(mesh);
    }
  }

  private createTool(): { root: TransformNode; pick: TransformNode; heldBlock: Mesh } {
    const root = new TransformNode('voxel-proof-held-root', this.scene);
    root.parent = this.camera;
    root.position = new Vector3(0.82, -0.57, 1.28);
    root.rotation = new Vector3(-0.2, -0.16, -0.18);
    root.scaling = new Vector3(0.46, 0.46, 0.46);

    const pick = new TransformNode('voxel-proof-builder-pick', this.scene);
    pick.parent = root;
    const glove = flatMaterial(this.scene, 'voxel-proof-glove', '#f1dfba');
    const handle = pixelMaterial(this.scene, 'voxel-proof-pick-handle', [
      '#254c49',
      '#356e68',
      '#173431',
    ]);
    const head = pixelMaterial(this.scene, 'voxel-proof-pick-head', [
      '#d59245',
      '#f0bc70',
      '#916027',
    ]);
    const hand = CreateBox(
      'voxel-proof-hand',
      { width: 0.34, height: 0.42, depth: 0.4 },
      this.scene,
    );
    hand.parent = pick;
    hand.position = new Vector3(0.13, -0.18, 0);
    hand.material = glove;
    const grip = CreateBox(
      'voxel-proof-pick-grip',
      { width: 0.14, height: 0.92, depth: 0.14 },
      this.scene,
    );
    grip.parent = pick;
    grip.position = new Vector3(-0.06, 0.18, 0);
    grip.rotation.z = -0.38;
    grip.material = handle;
    const pickHead = CreateBox(
      'voxel-proof-pick-head-mesh',
      { width: 0.92, height: 0.16, depth: 0.18 },
      this.scene,
    );
    pickHead.parent = pick;
    pickHead.position = new Vector3(-0.16, 0.58, 0);
    pickHead.rotation.z = -0.08;
    pickHead.material = head;
    const pickTip = CreateBox(
      'voxel-proof-pick-tip',
      { width: 0.18, height: 0.34, depth: 0.18 },
      this.scene,
    );
    pickTip.parent = pick;
    pickTip.position = new Vector3(-0.55, 0.45, 0);
    pickTip.rotation.z = -0.38;
    pickTip.material = head;
    const heldBlock = CreateBox('voxel-proof-held-block', { size: 0.5 }, this.scene);
    heldBlock.parent = root;
    heldBlock.position = new Vector3(-0.1, 0.1, 0);
    heldBlock.material = this.builderMaterial;
    heldBlock.isPickable = false;
    for (const mesh of [hand, grip, pickHead, pickTip, heldBlock]) {
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
    }
    return { root, pick, heldBlock };
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
    if (this.paused || this.stopped) return;
    this.keys.add(event.code);
    if (event.code === 'Digit1') this.selectSlot(0);
    if (event.code === 'Digit2') this.selectSlot(1);
    if (event.code === 'KeyF' && !event.repeat) this.setMining(true);
    if (event.code === 'KeyE' && !event.repeat) this.place();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (event.code === 'KeyF') this.setMining(false);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null || this.paused || this.stopped) return;
    this.pointerId = event.pointerId;
    this.pointerPoint = { x: event.clientX, y: event.clientY };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers do not always create capture state.
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || this.paused || this.stopped) return;
    const dx = event.clientX - this.pointerPoint.x;
    const dy = event.clientY - this.pointerPoint.y;
    this.pointerPoint = { x: event.clientX, y: event.clientY };
    this.camera.rotation.y += dx * 0.0036;
    this.camera.rotation.x = Math.max(-0.86, Math.min(0.72, this.camera.rotation.x + dy * 0.0032));
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.pointerId = null;
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.stopped = true;
    this.paused = true;
    this.clearInput();
    this.callbacks.onContextLost();
  };

  private render(): void {
    if (this.disposed) return;
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (!this.paused && !this.stopped) {
      this.updateMovement(deltaSeconds);
      this.targetTick += deltaSeconds;
      if (this.targetTick >= 0.08) {
        this.targetTick = 0;
        this.updateTarget();
      }
      this.updateMining(deltaSeconds);
      this.updatePickup(now);
      this.updateTool(deltaSeconds);
      const rebuilt = this.worldRenderer.flushDirtyRegions(2);
      if (rebuilt.length > 0) this.lastRebuiltRegions = rebuilt;
    }

    if (now - this.lastFpsUpdate >= 500) {
      this.lastFpsUpdate = now;
      const fps = this.engine.getFps();
      this.currentFps = Number.isFinite(fps) ? Math.round(fps) : 0;
      this.emitSnapshot();
    }
    this.scene.render();
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
    movement.scaleInPlace(deltaSeconds * 3.5);
    const result = movePlayer(
      this.world,
      this.playerPosition,
      { x: movement.x, z: movement.z },
      { stepHeight: 0.55, maxSubstep: 0.18 },
    );
    this.playerPosition = result.position;
    if (result.stepped) this.autoSteps += 1;
    this.camera.position.set(
      this.playerPosition.x,
      this.playerPosition.y + EYE_HEIGHT,
      this.playerPosition.z,
    );
  }

  private updateTarget(): void {
    if (proofPhase(this.state) === 'complete') {
      this.currentTarget = null;
      this.currentHit = null;
      this.placement = { valid: false, destination: null, failure: 'no-target' };
      this.targetLabel = '';
      this.outline.setEnabled(false);
      this.invalidCross.setEnabled(false);
      return;
    }
    const previousTarget = this.currentTarget;
    const previousHit = this.currentHit?.cell ?? null;
    const previousDestination = this.placement.destination;
    const previousPlacementValid = this.placement.valid;
    const previousPlacementFailure = this.placement.failure;
    const previousFace = faceLabel(this.currentHit?.normal ?? null);
    const direction = this.camera.getForwardRay().direction;
    this.currentHit = raycastVoxel(
      this.world,
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: direction.x, y: direction.y, z: direction.z },
      { maxDistance: 5, maxSteps: 64 },
    );
    const expectedTarget = this.expectedPlacementTarget();
    this.placement = validateTargetFacePlacement(
      this.world,
      this.currentHit,
      playerBodyAt(this.playerPosition),
      new Set(expectedTarget ? [voxelKey(expectedTarget.destination)] : []),
    );
    this.currentTarget = null;
    this.targetLabel = '';
    const hitKey = this.currentHit ? voxelKey(this.currentHit.cell) : '';
    if (
      this.currentHit?.block === VoxelBlock.Builder &&
      SUPPLY_KEYS.has(hitKey) &&
      this.world.get(this.currentHit.cell) === VoxelBlock.Builder
    ) {
      this.currentTarget = 'supply';
      this.targetLabel = `BUILDER BLOCK SUPPLY · GRID ${pointLabel(this.currentHit.cell)}`;
    } else if (this.currentHit?.block === VoxelBlock.Builder && this.installedCells.has(hitKey)) {
      this.currentTarget = 'placed-block';
      const definition = PLACEMENT_TARGETS.find((target) =>
        sameVoxel(target.destination, this.currentHit?.cell ?? null),
      );
      this.targetLabel = `INSTALLED BUILDER BLOCK · ${definition?.face ?? 'TARGET'} FACE`;
    } else if (
      this.state.inventory.selectedSlot === 1 &&
      inventoryCount(this.state.inventory, 'builder-block') > 0
    ) {
      if (this.placement.valid && this.placement.destination) {
        this.currentTarget = 'placement';
        const definition = PLACEMENT_TARGETS.find((target) =>
          sameVoxel(target.destination, this.placement.destination),
        );
        this.targetLabel = `VALID ${definition?.face ?? ''} FACE · PLACE BLOCK`;
      } else if (this.placement.destination) {
        this.targetLabel = `BLOCKED FACE × ${this.placement.failure?.replace('-', ' ').toUpperCase()}`;
      }
    }

    const changed =
      previousTarget !== this.currentTarget ||
      !sameVoxel(previousHit, this.currentHit?.cell ?? null) ||
      !sameVoxel(previousDestination, this.placement.destination) ||
      previousPlacementValid !== this.placement.valid ||
      previousPlacementFailure !== this.placement.failure ||
      previousFace !== faceLabel(this.currentHit?.normal ?? null);
    if (changed) {
      this.state = cancelProofMining(this.state);
      if (this.currentTarget === 'placement') {
        this.state = {
          ...this.state,
          feedback: 'Valid bracketed cell found from the targeted face. Press Place.',
        };
      } else if (this.currentTarget === 'supply' && this.state.inventory.selectedSlot === 0) {
        this.state = { ...this.state, feedback: 'Builder Block supply targeted. Hold Mine.' };
      } else if (this.currentTarget === 'placed-block' && this.state.inventory.selectedSlot === 0) {
        this.state = { ...this.state, feedback: 'Installed block targeted. Hold Remove.' };
      } else if (
        this.state.inventory.selectedSlot === 1 &&
        inventoryCount(this.state.inventory, 'builder-block') > 0
      ) {
        this.state = {
          ...this.state,
          feedback: `Invalid placement: ${this.placement.failure?.replace('-', ' ') ?? 'aim at the active bracket'}. Use the ${expectedTarget?.face.toLowerCase() ?? 'active'} face bracket.`,
        };
      }
      this.mineHeld = false;
      this.emitSnapshot();
    }
    this.updateOutline();
    this.syncAnchorGhosts();
  }

  private updateOutline(): void {
    const previewDestination =
      this.state.inventory.selectedSlot === 1 ? this.placement.destination : null;
    const targetPoint =
      this.currentTarget === 'supply' || this.currentTarget === 'placed-block'
        ? this.currentHit?.cell
        : previewDestination;
    if (!targetPoint) {
      this.outline.setEnabled(false);
      this.invalidCross.setEnabled(false);
      return;
    }
    this.outline.position.set(targetPoint.x, targetPoint.y, targetPoint.z);
    const valid = this.currentTarget !== null;
    this.outlineMaterial.diffuseColor = Color3.FromHexString(valid ? '#efff8a' : '#ff755f');
    this.outlineMaterial.emissiveColor = Color3.FromHexString(valid ? '#8eb83f' : '#9b2e25');
    this.outline.setEnabled(true);
    this.invalidCross.position.set(targetPoint.x, targetPoint.y, targetPoint.z);
    this.invalidCross.setEnabled(!valid && Boolean(previewDestination));
  }

  private updateMining(deltaSeconds: number): void {
    if (!this.mineHeld) return;
    this.mineTick += deltaSeconds;
    if (this.mineTick < 0.06) return;
    const amount = this.mineTick / 0.72;
    this.mineTick = 0;
    this.advanceMining(amount);
  }

  private updatePickup(now: number): void {
    for (let index = 0; index < this.pickupPool.entries.length; index += 1) {
      const entry = this.pickupPool.entries[index];
      const mesh = this.pickupMeshes[index];
      mesh.setEnabled(entry.active);
      if (!entry.active) continue;
      const bob = this.reducedMotion ? 0 : Math.sin(now * 0.004 + entry.bobPhase) * 0.11;
      mesh.position.set(entry.position.x, entry.position.y + bob, entry.position.z);
      if (!this.reducedMotion) mesh.rotation.y += 0.018;
    }
    const nearby = this.pickupPool.nearbyIndices(
      {
        x: this.playerPosition.x,
        y: this.playerPosition.y + 0.5,
        z: this.playerPosition.z,
      },
      1.35,
    );
    if (nearby.length === 0) return;
    for (const index of nearby) {
      const pickup = this.pickupPool.entries[index];
      const transition = collectProofDrop(this.state, pickup.count);
      this.state = transition.state;
      if (transition.accepted) this.pickupPool.take(index);
    }
    this.syncHeldItem();
    this.emitSnapshot();
  }

  private updateTool(deltaSeconds: number): void {
    if (this.swingTime <= 0 || this.reducedMotion) {
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

  private advanceMining(amount: number): void {
    this.swingTime = 0.24;
    const minedCell = this.currentHit?.cell ? { ...this.currentHit.cell } : null;
    const previousState = this.state;
    const result = advanceProofMining(this.state, this.currentTarget, amount);
    this.state = result.state;
    if (minedCell && result.event !== 'none') {
      const transaction = commitMinedProofBlock({
        world: this.world,
        pickupPool: this.pickupPool,
        installedCells: this.installedCells,
        minedCell,
        event: result.event,
        previousState,
        minedState: result.state,
      });
      this.state = transaction.state;
      this.mineHeld = false;
      this.syncAnchorGhosts();
      this.flushWorldEdits();
    }
    this.emitSnapshot();
  }

  private flushWorldEdits(): void {
    const rebuilt = this.worldRenderer.flushDirtyRegions(Number.POSITIVE_INFINITY);
    if (rebuilt.length > 0) this.lastRebuiltRegions = rebuilt;
  }

  private expectedPlacementTarget(): PlacementTarget | undefined {
    return PLACEMENT_TARGETS.find(
      (target) => this.world.get(target.destination) === VoxelBlock.Air,
    );
  }

  private syncAnchorGhosts(): void {
    const phase = proofPhase(this.state);
    const expected = this.expectedPlacementTarget();
    const showCurrent =
      (phase === 'place-frame' || phase === 'repair-frame') &&
      this.state.inventory.selectedSlot === 1;
    for (const [key, mesh] of this.anchorGhosts) {
      mesh.setEnabled(Boolean(showCurrent && expected && voxelKey(expected.destination) === key));
    }
  }

  private finishFoundationView(): void {
    this.playerPosition = { x: 0, y: 0.5, z: 2.8 };
    this.camera.position.set(
      this.playerPosition.x,
      this.playerPosition.y + EYE_HEIGHT,
      this.playerPosition.z,
    );
    this.camera.setTarget(new Vector3(0, 1.25, -2));
    this.currentTarget = null;
    this.currentHit = null;
    this.placement = { valid: false, destination: null, failure: 'no-target' };
    this.targetLabel = '';
    this.outline.setEnabled(false);
    this.invalidCross.setEnabled(false);
    this.syncAnchorGhosts();
  }

  private syncHeldItem(): void {
    const pickSelected = this.state.inventory.selectedSlot === 0;
    this.pickRoot.setEnabled(pickSelected);
    this.heldBlock.setEnabled(
      !pickSelected && inventoryCount(this.state.inventory, 'builder-block') > 0,
    );
  }

  private inventorySnapshot(): HotbarSnapshot {
    return {
      selectedSlot: this.state.inventory.selectedSlot,
      slots: this.state.inventory.slots.map((slot) => ({ ...slot })),
    };
  }

  private emitSnapshot(): void {
    this.syncHeldItem();
    const renderer = this.worldRenderer.stats();
    this.callbacks.onSnapshot({
      state: { ...this.state, inventory: this.inventorySnapshot() },
      phase: proofPhase(this.state),
      target: this.currentTarget,
      targetLabel: this.targetLabel,
      fps: this.currentFps,
      diagnostics: {
        world: '24x12x24',
        regionMeshes: renderer.regionMeshCount,
        lastRebuiltRegions: [...this.lastRebuiltRegions],
        totalRegionRebuilds: renderer.totalRebuilds,
        targetCell: pointLabel(this.currentHit?.cell ?? null),
        targetFace: faceLabel(this.currentHit?.normal ?? null),
        adjacentCell: pointLabel(this.currentHit?.adjacent ?? null),
        playerCell: pointLabel({
          x: Math.floor(this.playerPosition.x + 0.5),
          y: Math.floor(this.playerPosition.y + 0.5),
          z: Math.floor(this.playerPosition.z + 0.5),
        }),
        autoSteps: this.autoSteps,
        pickups: this.pickupPool.stats(),
        storageWrites: 0,
        apiRequests: 0,
      },
    });
  }

  setJoystick(x: number, z: number): void {
    if (this.paused || this.stopped) {
      this.joystick = { x: 0, z: 0 };
      return;
    }
    this.joystick = {
      x: Math.max(-1, Math.min(1, x)),
      z: Math.max(-1, Math.min(1, z)),
    };
  }

  setMining(active: boolean): void {
    if (this.paused || this.stopped) return;
    this.mineHeld = active;
    this.mineTick = 0;
    if (active) {
      this.swingTime = 0.24;
    } else if (this.state.miningProgress > 0) {
      this.state = cancelProofMining(this.state);
      this.emitSnapshot();
    }
  }

  place(): void {
    if (this.paused || this.stopped) return;
    const result = placeProofBlock(
      this.state,
      this.currentTarget === 'placement' && this.placement.valid,
    );
    this.state = result.state;
    if (result.event !== 'none' && this.placement.destination) {
      const destination = { ...this.placement.destination };
      this.world.set(destination, VoxelBlock.Builder);
      this.installedCells.add(voxelKey(destination));
      this.flushWorldEdits();
      this.currentTarget = null;
      this.placement = { valid: false, destination: null, failure: 'no-target' };
      if (result.event === 'block-repaired') this.finishFoundationView();
      else this.syncAnchorGhosts();
    }
    this.emitSnapshot();
  }

  selectSlot(slot: number): void {
    if (this.paused || this.stopped) return;
    this.state = selectProofSlot(this.state, slot);
    this.syncHeldItem();
    this.updateTarget();
    this.emitSnapshot();
  }

  recenter(): void {
    if (this.paused || this.stopped) return;
    let target: VoxelPoint | undefined;
    if (this.state.suppliesMined < FOUNDATION_BLOCK_COUNT) {
      target = SUPPLY_CELLS.find((cell) => this.world.get(cell) === VoxelBlock.Builder);
    } else if (!this.state.repairStarted && this.state.blocksPlaced === FOUNDATION_BLOCK_COUNT) {
      const key = this.installedCells.values().next().value as string | undefined;
      if (key) {
        const [x, y, z] = key.split(',').map(Number);
        target = { x, y, z };
      }
    } else {
      const placementTarget = PLACEMENT_TARGETS.find(
        (candidate) => this.world.get(candidate.destination) === VoxelBlock.Air,
      );
      if (placementTarget) {
        target = {
          x:
            placementTarget.backing.x +
            (placementTarget.destination.x - placementTarget.backing.x) * 0.51,
          y:
            placementTarget.backing.y +
            (placementTarget.destination.y - placementTarget.backing.y) * 0.51,
          z:
            placementTarget.backing.z +
            (placementTarget.destination.z - placementTarget.backing.z) * 0.51,
        };
      }
    }
    if (target) this.camera.setTarget(new Vector3(target.x, target.y, target.z));
    this.emitSnapshot();
  }

  setPaused(paused: boolean): void {
    if (this.stopped) return;
    this.clearInput();
    this.paused = paused;
  }

  clearInput(): void {
    this.keys.clear();
    this.joystick = { x: 0, z: 0 };
    this.mineHeld = false;
    this.mineTick = 0;
    this.pointerId = null;
    if (this.state.miningProgress > 0) {
      this.state = cancelProofMining(this.state);
      if (!this.disposed) this.emitSnapshot();
    }
  }

  resize(): void {
    this.clearInput();
    this.engine.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearInput();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.handlePointerUp);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.worldRenderer.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
