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
import '@babylonjs/core/Rendering/edgesRenderer';
import { Scene } from '@babylonjs/core/scene.pure';
import {
  BOUNDARY_SECTORS,
  nextBoundarySector,
  type BoundaryLayer,
  type BoundarySector,
} from '../voxel/boundaryAdapter';
import { VoxelBlock } from '../voxel/blocks';
import { PickupPool, type PickupPoolStats } from '../voxel/PickupPool';
import { movePlayer, playerBodyAt } from '../voxel/PlayerMotor';
import { validateTargetFacePlacement, type PlacementResult } from '../voxel/placement';
import { raycastVoxel, type VoxelRaycastHit } from '../voxel/raycastVoxel';
import { sameVoxel, voxelKey, type VoxelPoint } from '../voxel/types';
import { VoxelWorld } from '../voxel/VoxelWorld';
import { VoxelWorldRenderer } from '../voxel/babylon/VoxelWorldRenderer';
import {
  advanceBoundaryMining,
  boundarySliceCheckpoint,
  boundarySlicePhase,
  cancelBoundaryMining,
  cloneBoundarySliceState,
  collectBoundaryStack,
  initialBoundarySliceState,
  interactBoundarySlice,
  placeBoundarySliceModule,
  selectBoundarySlot,
  type BoundarySlicePhase,
  type BoundarySliceState,
  type BoundarySliceTarget,
} from './boundarySliceState';

const WORLD_OPTIONS = {
  min: { x: -12, y: 0, z: -12 },
  width: 24,
  height: 12,
  depth: 24,
  regionSize: { x: 8, y: 12, z: 8 },
} as const;
const EYE_HEIGHT = 1.7;
const WALL_SUPPLY_CELL: VoxelPoint = { x: -2, y: 1, z: 5 };
const MEMBRANE_SUPPLY_CELL: VoxelPoint = { x: 2, y: 1, z: 5 };
const CYTOPLASM_CONTROL_CELL: VoxelPoint = { x: 0, y: 1, z: -1 };

interface InstalledOwner {
  layer: BoundaryLayer;
  sectorId: string;
}

export interface BoundarySliceDiagnostics {
  world: '24x12x24';
  regionMeshes: number;
  lastRebuiltRegions: string[];
  totalRegionRebuilds: number;
  targetCell: string;
  targetFace: string;
  adjacentCell: string;
  placementFailure: string;
  playerCell: string;
  autoSteps: number;
  pickups: PickupPoolStats;
  actionHeld: boolean;
  cytoplasmSolidCells: 0;
  storageWrites: 0;
  apiRequests: 0;
}

export interface BoundarySliceSnapshot {
  state: BoundarySliceState;
  phase: BoundarySlicePhase;
  target: BoundarySliceTarget;
  targetLabel: string;
  activeSector: string;
  fps: number;
  score: number;
  diagnostics: BoundarySliceDiagnostics;
}

interface BoundarySliceCallbacks {
  onSnapshot: (snapshot: BoundarySliceSnapshot) => void;
  onContextLost: () => void;
}

function flatMaterial(scene: Scene, name: string, color: string, alpha = 1): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.emissiveColor = Color3.FromHexString(color).scale(alpha < 1 ? 0.2 : 0.04);
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

function sameNullableVoxel(a: VoxelPoint | null, b: VoxelPoint | null): boolean {
  if (!a || !b) return a === b;
  return sameVoxel(a, b);
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

function sectorCells(sector: BoundarySector, layer: BoundaryLayer): VoxelPoint[] {
  return layer === 'cellWall' ? sector.wallCells : sector.membraneCells;
}

function playerOverlapsVoxel(player: ReturnType<typeof playerBodyAt>, cell: VoxelPoint): boolean {
  return (
    player.position.x + player.radius > cell.x - 0.5 &&
    player.position.x - player.radius < cell.x + 0.5 &&
    player.position.y + player.height > cell.y - 0.5 &&
    player.position.y < cell.y + 0.5 &&
    player.position.z + player.radius > cell.z - 0.5 &&
    player.position.z - player.radius < cell.z + 0.5
  );
}

export class BoundarySliceScene {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: BoundarySliceCallbacks;
  private readonly keys = new Set<string>();
  private readonly world: VoxelWorld;
  private readonly worldRenderer: VoxelWorldRenderer;
  private readonly pickupPool = new PickupPool(4);
  private readonly pickupMeshes: Mesh[] = [];
  private readonly installedOwners = new Map<string, InstalledOwner>();
  private readonly toolRoot: TransformNode;
  private readonly pickRoot: TransformNode;
  private readonly heldWall: Mesh;
  private readonly heldMembrane: Mesh;
  private readonly outline: TransformNode;
  private readonly invalidCross: TransformNode;
  private readonly outlineMaterial: StandardMaterial;
  private readonly invalidMaterial: StandardMaterial;
  private readonly activeGhost: TransformNode;
  private readonly wallPickupMaterial: StandardMaterial;
  private readonly membranePickupMaterial: StandardMaterial;
  private readonly cytoplasmFill: Mesh;
  private readonly wallEvidenceMeshes: Mesh[] = [];
  private readonly membraneEvidenceMeshes: Mesh[] = [];
  private readonly reducedMotion: boolean;
  private state = cloneBoundarySliceState(initialBoundarySliceState);
  private playerPosition: VoxelPoint = { x: 0, y: 0.5, z: 9 };
  private joystick = { x: 0, z: 0 };
  private currentTarget: BoundarySliceTarget = null;
  private currentHit: VoxelRaycastHit | null = null;
  private currentOwner: InstalledOwner | null = null;
  private placement: PlacementResult = {
    valid: false,
    destination: null,
    failure: 'no-target',
  };
  private placementSector: BoundarySector | null = null;
  private targetLabel = '';
  private pointerId: number | null = null;
  private pointerPoint = { x: 0, y: 0 };
  private actionHeld = false;
  private actionTick = 0;
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

  constructor(canvas: HTMLCanvasElement, callbacks: BoundarySliceCallbacks) {
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
      'boundary-slice-camera',
      new Vector3(this.playerPosition.x, this.playerPosition.y + EYE_HEIGHT, this.playerPosition.z),
      this.scene,
    );
    this.camera.minZ = 0.08;
    this.camera.maxZ = 48;
    this.camera.fov = 1.2;
    this.camera.inputs.clear();
    this.camera.setTarget(new Vector3(WALL_SUPPLY_CELL.x, WALL_SUPPLY_CELL.y, WALL_SUPPLY_CELL.z));
    this.scene.activeCamera = this.camera;

    const skyLight = new HemisphericLight(
      'boundary-slice-sky-light',
      new Vector3(0.2, 1, 0.15),
      this.scene,
    );
    skyLight.intensity = 1.18;
    skyLight.groundColor = Color3.FromHexString('#677b5f');
    const sun = new DirectionalLight('boundary-slice-sun', new Vector3(-0.45, -1, 0.3), this.scene);
    sun.intensity = 0.52;

    this.wallPickupMaterial = pixelMaterial(this.scene, 'boundary-wall-module', [
      '#648f47',
      '#91b963',
      '#35562d',
    ]);
    this.membranePickupMaterial = pixelMaterial(this.scene, 'boundary-membrane-module', [
      '#4ba8b6',
      '#8bd2d4',
      '#286a75',
    ]);
    this.world = this.createWorld();
    this.worldRenderer = new VoxelWorldRenderer(this.scene, this.world);
    this.lastRebuiltRegions = this.worldRenderer.buildInitialWorld();
    this.createSkyDecorations();
    this.outlineMaterial = flatMaterial(
      this.scene,
      'boundary-target-outline-material',
      '#fff2b0',
      0.95,
    );
    this.outlineMaterial.disableDepthWrite = true;
    this.outline = createEdgeMarker(this.scene, 'boundary-target-outline', this.outlineMaterial);
    this.outline.setEnabled(false);
    this.invalidMaterial = flatMaterial(
      this.scene,
      'boundary-invalid-cross-material',
      '#ff755f',
      0.96,
    );
    this.invalidMaterial.disableDepthWrite = true;
    this.invalidCross = createInvalidCross(
      this.scene,
      'boundary-invalid-cross',
      this.invalidMaterial,
    );
    this.invalidCross.setEnabled(false);
    const ghostMaterial = flatMaterial(
      this.scene,
      'boundary-active-bracket-material',
      '#ffdc75',
      0.72,
    );
    ghostMaterial.disableDepthWrite = true;
    this.activeGhost = createEdgeMarker(
      this.scene,
      'boundary-active-bracket',
      ghostMaterial,
      1.16,
      0.04,
    );
    this.activeGhost.setEnabled(false);
    this.createPickupMeshes();
    const tool = this.createTool();
    this.toolRoot = tool.root;
    this.pickRoot = tool.pick;
    this.heldWall = tool.heldWall;
    this.heldMembrane = tool.heldMembrane;
    this.cytoplasmFill = this.createCytoplasmFill();
    this.createFunctionEvidence();
    this.syncVisualState();
    this.attachInput();

    canvas.addEventListener('webglcontextlost', this.handleContextLost, { passive: false });
    this.engine.runRenderLoop(() => this.render());
    this.emitSnapshot();
  }

  private createWorld(): VoxelWorld {
    const world = new VoxelWorld(WORLD_OPTIONS);
    for (let x = -11; x <= 11; x += 1) {
      for (let z = -11; z <= 11; z += 1) {
        const path = x >= -2 && x <= 2 && z >= -1 && z <= 10;
        const modelFloor = x >= -6 && x <= 6 && z >= -9 && z <= 0;
        world.set(
          { x, y: 0, z },
          modelFloor ? VoxelBlock.Foundation : path ? VoxelBlock.Path : VoxelBlock.Grass,
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

    for (let x = -2; x <= 2; x += 1) world.set({ x, y: 1, z: 7 }, VoxelBlock.Step);
    for (let x = -1; x <= 1; x += 1) {
      world.set({ x, y: 1, z: 11 }, VoxelBlock.Stone);
      world.set({ x, y: 2, z: 11 }, VoxelBlock.Stone);
    }

    world.set(WALL_SUPPLY_CELL, VoxelBlock.CellWall);
    world.set(MEMBRANE_SUPPLY_CELL, VoxelBlock.CellMembrane);
    world.set(CYTOPLASM_CONTROL_CELL, VoxelBlock.ModelControl);

    for (const sector of BOUNDARY_SECTORS) {
      for (let y = 1; y <= 3; y += 1) {
        world.set({ ...sector.wallBacking, y }, VoxelBlock.Stone);
      }
    }

    for (const [x, z] of [
      [-8, 3],
      [8, -6],
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
    const clouds = flatMaterial(this.scene, 'boundary-clouds', '#f4fbff');
    thinInstanceBoxes(
      this.scene,
      'boundary-cloud-blocks',
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
    const sunMaterial = flatMaterial(this.scene, 'boundary-sun-material', '#ffe59a');
    const sun = CreateBox(
      'boundary-square-sun',
      { width: 2.8, height: 2.8, depth: 0.18 },
      this.scene,
    );
    sun.position = new Vector3(-13, 14, -22);
    sun.material = sunMaterial;
    sun.isPickable = false;
  }

  private createPickupMeshes(): void {
    for (let index = 0; index < this.pickupPool.capacity; index += 1) {
      const mesh = CreateBox(`boundary-pooled-drop-${index}`, { size: 0.62 }, this.scene);
      mesh.material = this.wallPickupMaterial;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.pickupMeshes.push(mesh);
    }
  }

  private createTool(): {
    root: TransformNode;
    pick: TransformNode;
    heldWall: Mesh;
    heldMembrane: Mesh;
  } {
    const root = new TransformNode('boundary-held-root', this.scene);
    root.parent = this.camera;
    root.position = new Vector3(0.82, -0.57, 1.28);
    root.rotation = new Vector3(-0.2, -0.16, -0.18);
    root.scaling = new Vector3(0.46, 0.46, 0.46);

    const pick = new TransformNode('boundary-builder-pick', this.scene);
    pick.parent = root;
    const glove = flatMaterial(this.scene, 'boundary-glove', '#f1dfba');
    const handle = pixelMaterial(this.scene, 'boundary-pick-handle', [
      '#254c49',
      '#356e68',
      '#173431',
    ]);
    const head = pixelMaterial(this.scene, 'boundary-pick-head', ['#d59245', '#f0bc70', '#916027']);
    const hand = CreateBox('boundary-hand', { width: 0.34, height: 0.42, depth: 0.4 }, this.scene);
    hand.parent = pick;
    hand.position = new Vector3(0.13, -0.18, 0);
    hand.material = glove;
    const grip = CreateBox(
      'boundary-pick-grip',
      { width: 0.14, height: 0.92, depth: 0.14 },
      this.scene,
    );
    grip.parent = pick;
    grip.position = new Vector3(-0.06, 0.18, 0);
    grip.rotation.z = -0.38;
    grip.material = handle;
    const pickHead = CreateBox(
      'boundary-pick-head-mesh',
      { width: 0.92, height: 0.16, depth: 0.18 },
      this.scene,
    );
    pickHead.parent = pick;
    pickHead.position = new Vector3(-0.16, 0.58, 0);
    pickHead.rotation.z = -0.08;
    pickHead.material = head;
    const pickTip = CreateBox(
      'boundary-pick-tip',
      { width: 0.18, height: 0.34, depth: 0.18 },
      this.scene,
    );
    pickTip.parent = pick;
    pickTip.position = new Vector3(-0.55, 0.45, 0);
    pickTip.rotation.z = -0.38;
    pickTip.material = head;

    const heldWall = CreateBox(
      'boundary-held-wall',
      { width: 0.58, height: 0.58, depth: 0.34 },
      this.scene,
    );
    heldWall.parent = root;
    heldWall.position = new Vector3(-0.1, 0.1, 0);
    heldWall.material = this.wallPickupMaterial;
    const heldMembrane = CreateBox(
      'boundary-held-membrane',
      { width: 0.62, height: 0.62, depth: 0.14 },
      this.scene,
    );
    heldMembrane.parent = root;
    heldMembrane.position = new Vector3(-0.1, 0.1, 0);
    heldMembrane.material = this.membranePickupMaterial;
    for (const mesh of [hand, grip, pickHead, pickTip, heldWall, heldMembrane]) {
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
    }
    return { root, pick, heldWall, heldMembrane };
  }

  private createCytoplasmFill(): Mesh {
    const width = 6.2;
    const height = 2.2;
    const depth = 3.6;
    const fill = CreateBox(
      'boundary-cytoplasm-non-solid-fill',
      { width, height, depth },
      this.scene,
    );
    fill.position = new Vector3(0, 1.6, -4);
    const material = flatMaterial(this.scene, 'boundary-cytoplasm-material', '#f1c94f', 0.42);
    material.emissiveColor = Color3.FromHexString('#6b5722').scale(0.35);
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    fill.material = material;
    fill.enableEdgesRendering();
    fill.edgesWidth = 2;
    fill.edgesColor = Color4.FromHexString('#fff0a899');
    fill.isPickable = false;

    const outlineMaterial = flatMaterial(
      this.scene,
      'boundary-cytoplasm-extent-material',
      '#ffe48a',
      0.9,
    );
    outlineMaterial.emissiveColor = Color3.FromHexString('#7d6016').scale(0.45);
    outlineMaterial.disableDepthWrite = true;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const halfDepth = depth / 2;
    const strip = 0.045;
    const addExtent = (
      name: string,
      dimensions: { width: number; height: number; depth: number },
      position: Vector3,
    ): void => {
      const edge = CreateBox(name, dimensions, this.scene);
      edge.parent = fill;
      edge.position.copyFrom(position);
      edge.material = outlineMaterial;
      edge.isPickable = false;
    };
    for (const y of [-halfHeight, halfHeight]) {
      for (const z of [-halfDepth, halfDepth]) {
        addExtent(
          `boundary-cytoplasm-extent-x-${y}-${z}`,
          { width, height: strip, depth: strip },
          new Vector3(0, y, z),
        );
      }
      for (const x of [-halfWidth, halfWidth]) {
        addExtent(
          `boundary-cytoplasm-extent-z-${x}-${y}`,
          { width: strip, height: strip, depth },
          new Vector3(x, y, 0),
        );
      }
    }
    for (const x of [-halfWidth, halfWidth]) {
      for (const z of [-halfDepth, halfDepth]) {
        addExtent(
          `boundary-cytoplasm-extent-y-${x}-${z}`,
          { width: strip, height, depth: strip },
          new Vector3(x, 0, z),
        );
      }
    }

    fill.setEnabled(false);
    return fill;
  }

  private createFunctionEvidence(): void {
    const wallMaterial = flatMaterial(this.scene, 'boundary-wall-support-check', '#efff91', 0.95);
    const membraneMaterial = flatMaterial(
      this.scene,
      'boundary-membrane-control-check',
      '#c8ffff',
      0.92,
    );
    for (const sector of BOUNDARY_SECTORS) {
      const brace = CreateBox(
        `boundary-support-brace-${sector.id}`,
        { width: 0.16, height: 3.4, depth: 0.16 },
        this.scene,
      );
      brace.position = new Vector3(sector.wallAnchor.x, 2.2, sector.wallAnchor.z);
      brace.material = wallMaterial;
      brace.isPickable = false;
      brace.setEnabled(false);
      this.wallEvidenceMeshes.push(brace);

      const inside = new Vector3(
        sector.membraneAnchor.x * 0.84,
        1.35,
        -4 + (sector.membraneAnchor.z + 4) * 0.84,
      );
      for (const offset of [-0.22, 0.22]) {
        const arrow = CreateBox(
          `boundary-movement-arrow-${sector.id}-${offset}`,
          { width: 0.34, height: 0.1, depth: 0.1 },
          this.scene,
        );
        arrow.position = inside.add(new Vector3(0, offset, 0));
        arrow.rotation.y = Math.atan2(sector.membraneAnchor.x, sector.membraneAnchor.z + 4);
        arrow.material = membraneMaterial;
        arrow.isPickable = false;
        arrow.setEnabled(false);
        this.membraneEvidenceMeshes.push(arrow);
      }
    }
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
    if (event.code === 'Digit3') this.selectSlot(2);
    if (event.code === 'KeyF' && !event.repeat) this.setActionHeld(true);
    if (event.code === 'KeyE' && !event.repeat) {
      if (this.isInteractionTarget()) this.interact();
      else this.place();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (event.code === 'KeyF') this.setActionHeld(false);
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
      this.updateHeldAction(deltaSeconds);
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

  private activeLayer(): BoundaryLayer | null {
    const phase = boundarySlicePhase(this.state);
    if (phase === 'build-wall') return 'cellWall';
    if (phase === 'build-membrane') return 'cellMembrane';
    if (phase === 'repair-module') return this.state.repair?.layer ?? null;
    return null;
  }

  private activeSector(): BoundarySector | null {
    if (this.state.repair && boundarySlicePhase(this.state) === 'repair-module') {
      return BOUNDARY_SECTORS.find((sector) => sector.id === this.state.repair?.sectorId) ?? null;
    }
    const layer = this.activeLayer();
    return layer ? nextBoundarySector(this.state.adapter, layer) : null;
  }

  private expectedBacking(sector: BoundarySector, layer: BoundaryLayer): VoxelPoint {
    return layer === 'cellWall' ? sector.wallBacking : sector.wallAnchor;
  }

  private updateTarget(): void {
    if (boundarySlicePhase(this.state) === 'complete') {
      const targetChanged =
        this.currentTarget !== null ||
        this.currentHit !== null ||
        this.currentOwner !== null ||
        this.targetLabel !== '' ||
        this.placement.destination !== null ||
        this.placement.failure !== 'no-target';
      this.currentTarget = null;
      this.currentHit = null;
      this.currentOwner = null;
      this.placement = { valid: false, destination: null, failure: 'no-target' };
      this.placementSector = null;
      this.targetLabel = '';
      this.outline.setEnabled(false);
      this.invalidCross.setEnabled(false);
      this.activeGhost.setEnabled(false);
      if (targetChanged) this.emitSnapshot();
      return;
    }
    const previousTarget = this.currentTarget;
    const previousHit = this.currentHit?.cell ?? null;
    const previousDestination = this.placement.destination;
    const previousLabel = this.targetLabel;
    const direction = this.camera.getForwardRay().direction;
    this.currentHit = raycastVoxel(
      this.world,
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: direction.x, y: direction.y, z: direction.z },
      { maxDistance: 5, maxSteps: 64 },
    );
    const hitKey = this.currentHit ? voxelKey(this.currentHit.cell) : '';
    this.currentOwner = this.installedOwners.get(hitKey) ?? null;
    this.currentTarget = null;
    this.targetLabel = '';
    this.placementSector = null;
    this.placement = { valid: false, destination: null, failure: 'no-target' };
    const phase = boundarySlicePhase(this.state);

    if (
      sameVoxel(this.currentHit?.cell ?? null, WALL_SUPPLY_CELL) &&
      phase === 'mine-wall-supply'
    ) {
      this.currentTarget = 'wall-supply';
      this.targetLabel = 'WALL SUPPLY · STACK ×6 · HOLD MINE';
    } else if (
      sameVoxel(this.currentHit?.cell ?? null, MEMBRANE_SUPPLY_CELL) &&
      phase === 'mine-membrane-supply'
    ) {
      this.currentTarget = 'membrane-supply';
      this.targetLabel = 'MEMBRANE SUPPLY · STACK ×6 · HOLD MINE';
    } else if (
      sameVoxel(this.currentHit?.cell ?? null, CYTOPLASM_CONTROL_CELL) &&
      (phase === 'activate-cytoplasm' || phase === 'inspect-cytoplasm')
    ) {
      this.currentTarget = 'cytoplasm-control';
      this.targetLabel =
        phase === 'activate-cytoplasm'
          ? 'CYTOPLASM CONTROL · TAP ACTIVATE'
          : 'CYTOPLASM FILL · TAP INTERACT';
    } else if (
      this.currentOwner &&
      !(this.activeLayer() === 'cellMembrane' && this.currentOwner.layer === 'cellWall')
    ) {
      const target =
        this.currentOwner.layer === 'cellWall' ? 'installed-wall' : 'installed-membrane';
      const inspectionPhase =
        (phase === 'inspect-wall' && this.currentOwner.layer === 'cellWall') ||
        (phase === 'inspect-membrane' && this.currentOwner.layer === 'cellMembrane') ||
        (phase === 'reinspect-module' && this.currentOwner.layer === this.state.repair?.layer);
      const removable =
        phase === 'activate-cytoplasm' &&
        this.state.inventory.selectedSlot === 0 &&
        this.currentOwner.layer === 'cellMembrane';
      if (inspectionPhase || removable) {
        this.currentTarget = target;
        this.targetLabel = removable
          ? `INNER MEMBRANE · ${this.currentOwner.sectorId.toUpperCase()} · HOLD REMOVE`
          : `${this.currentOwner.layer === 'cellWall' ? 'CELL WALL SUPPORT' : 'MEMBRANE MOVEMENT CONTROL'} · TAP INTERACT`;
      } else if (phase === 'activate-cytoplasm' && this.currentOwner.layer === 'cellWall') {
        this.targetLabel = 'OUTER WALL LOCKED · REMOVE INNER PAIRED MODULE FIRST';
      }
    } else {
      const layer = this.activeLayer();
      const sector = this.activeSector();
      if (layer && sector) {
        const allowedDestinations =
          layer === 'cellWall' ? [sector.wallAnchor] : sector.membraneCells;
        this.placement = validateTargetFacePlacement(
          this.world,
          this.currentHit,
          playerBodyAt(this.playerPosition),
          new Set(allowedDestinations.map(voxelKey)),
        );
        const expectedBacking = this.expectedBacking(sector, layer);
        const exactBacking =
          layer === 'cellWall'
            ? sameVoxel(this.currentHit?.cell ?? null, expectedBacking)
            : sector.wallCells.some((cell) => sameVoxel(this.currentHit?.cell ?? null, cell));
        if (
          this.placement.valid &&
          sectorCells(sector, layer).some((cell) =>
            playerOverlapsVoxel(playerBodyAt(this.playerPosition), cell),
          )
        ) {
          this.placement = {
            valid: false,
            destination: this.placement.destination,
            failure: 'player-overlap',
          };
        }
        if (this.placement.valid && exactBacking) {
          this.currentTarget = layer === 'cellWall' ? 'wall-anchor' : 'membrane-anchor';
          this.placementSector = sector;
          this.targetLabel = `VALID ${layer === 'cellWall' ? 'OUTER WALL' : 'INNER MEMBRANE'} · ${sector.label.toUpperCase()} · PLACE`;
        } else if (this.state.inventory.selectedSlot === (layer === 'cellWall' ? 1 : 2)) {
          this.targetLabel = `BLOCKED × FACE THE GOLD ${layer === 'cellWall' ? 'OUTER' : 'INNER'} BRACKETS`;
        }
      }
    }

    const changed =
      previousTarget !== this.currentTarget ||
      !sameNullableVoxel(previousHit, this.currentHit?.cell ?? null) ||
      !sameNullableVoxel(previousDestination, this.placement.destination) ||
      previousLabel !== this.targetLabel;
    if (changed) {
      this.state = cancelBoundaryMining(this.state);
      if (this.currentTarget === 'wall-supply' || this.currentTarget === 'membrane-supply') {
        this.state = { ...this.state, feedback: 'Supply crate targeted. Hold Mine once.' };
      } else if (this.currentTarget === 'wall-anchor' || this.currentTarget === 'membrane-anchor') {
        this.state = {
          ...this.state,
          feedback: 'Valid paired model brackets found. Tap Place.',
        };
      } else if (
        this.currentTarget === 'installed-wall' ||
        this.currentTarget === 'installed-membrane'
      ) {
        this.state = {
          ...this.state,
          feedback: this.targetLabel.includes('REMOVE')
            ? 'Installed membrane module targeted. Hold Remove.'
            : 'Model function evidence targeted. Tap Interact.',
        };
      } else if (this.currentTarget === 'cytoplasm-control') {
        this.state = {
          ...this.state,
          feedback:
            phase === 'activate-cytoplasm'
              ? 'Both nested layers are ready. Tap Activate.'
              : 'Cytoplasm fill ready for inspection. Tap Interact.',
        };
      } else if (this.activeLayer()) {
        this.state = {
          ...this.state,
          feedback:
            'Invalid placement: face the one active gold bracket. No item or score was lost.',
        };
      }
      this.actionHeld = false;
      this.emitSnapshot();
    }
    this.updateOutline();
    this.syncActiveGhost();
  }

  private updateOutline(): void {
    const targetPoint =
      this.currentTarget === 'wall-supply' ||
      this.currentTarget === 'membrane-supply' ||
      this.currentTarget === 'installed-wall' ||
      this.currentTarget === 'installed-membrane' ||
      this.currentTarget === 'cytoplasm-control'
        ? this.currentHit?.cell
        : this.placement.destination;
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
    this.invalidCross.setEnabled(!valid && Boolean(this.placement.destination));
  }

  private syncActiveGhost(): void {
    const sector = this.activeSector();
    const layer = this.activeLayer();
    if (!sector || !layer) {
      this.activeGhost.setEnabled(false);
      return;
    }
    const anchor = layer === 'cellWall' ? sector.wallAnchor : sector.membraneAnchor;
    this.activeGhost.position.set(anchor.x, anchor.y, anchor.z);
    this.activeGhost.setEnabled(true);
  }

  private updateHeldAction(deltaSeconds: number): void {
    if (!this.actionHeld) return;
    this.actionTick += deltaSeconds;
    if (this.actionTick < 0.06) return;
    const amount = this.actionTick / 0.72;
    this.actionTick = 0;
    this.advanceHeldAction(amount);
  }

  private updatePickup(now: number): void {
    for (let index = 0; index < this.pickupPool.entries.length; index += 1) {
      const entry = this.pickupPool.entries[index];
      const mesh = this.pickupMeshes[index];
      mesh.setEnabled(entry.active);
      if (!entry.active) continue;
      mesh.material =
        entry.item === 'cell-membrane-module'
          ? this.membranePickupMaterial
          : this.wallPickupMaterial;
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
      const next = collectBoundaryStack(this.state, pickup.item, pickup.count);
      if (!next) continue;
      this.state = next;
      this.pickupPool.take(index);
    }
    this.syncVisualState();
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

  private advanceHeldAction(amount: number): void {
    this.swingTime = 0.24;
    const previousState = cloneBoundarySliceState(this.state);
    const result = advanceBoundaryMining(
      this.state,
      this.currentTarget,
      amount,
      this.currentOwner ?? undefined,
    );
    this.state = result.state;
    if (result.event === 'none') {
      this.emitSnapshot();
      return;
    }

    let item: 'cell-wall-module' | 'cell-membrane-module';
    let count: number;
    let dropPoint: VoxelPoint;
    if (result.event === 'wall-stack-released') {
      item = 'cell-wall-module';
      count = 6;
      dropPoint = { ...WALL_SUPPLY_CELL };
      this.world.set(WALL_SUPPLY_CELL, VoxelBlock.Air);
    } else if (result.event === 'membrane-stack-released') {
      item = 'cell-membrane-module';
      count = 6;
      dropPoint = { ...MEMBRANE_SUPPLY_CELL };
      this.world.set(MEMBRANE_SUPPLY_CELL, VoxelBlock.Air);
    } else {
      item = result.removed?.layer === 'cellWall' ? 'cell-wall-module' : 'cell-membrane-module';
      count = 1;
      const sector = BOUNDARY_SECTORS.find(
        (candidate) => candidate.id === result.removed?.sectorId,
      )!;
      dropPoint =
        result.removed?.layer === 'cellWall'
          ? { ...sector.wallAnchor, y: 1 }
          : { ...sector.membraneAnchor, y: 1 };
      this.removeModuleGeometry(result.removed!.layer, sector);
    }

    const pickupIndex = this.pickupPool.spawn(item, count, dropPoint);
    if (pickupIndex === null) {
      this.state = previousState;
      if (result.event === 'wall-stack-released') {
        this.world.set(WALL_SUPPLY_CELL, VoxelBlock.CellWall);
      } else if (result.event === 'membrane-stack-released') {
        this.world.set(MEMBRANE_SUPPLY_CELL, VoxelBlock.CellMembrane);
      } else {
        const sector = BOUNDARY_SECTORS.find(
          (candidate) => candidate.id === result.removed?.sectorId,
        )!;
        this.installModuleGeometry(result.removed!.layer, sector);
      }
      this.state.feedback = 'Pickup pool full. The model stayed unchanged.';
    }
    this.actionHeld = false;
    this.flushWorldEdits();
    this.syncVisualState();
    this.emitSnapshot();
  }

  private installModuleGeometry(layer: BoundaryLayer, sector: BoundarySector): void {
    const block = layer === 'cellWall' ? VoxelBlock.CellWall : VoxelBlock.CellMembrane;
    for (const cell of sectorCells(sector, layer)) {
      this.world.set(cell, block);
      this.installedOwners.set(voxelKey(cell), { layer, sectorId: sector.id });
    }
  }

  private removeModuleGeometry(layer: BoundaryLayer, sector: BoundarySector): void {
    for (const cell of sectorCells(sector, layer)) {
      this.world.set(cell, VoxelBlock.Air);
      this.installedOwners.delete(voxelKey(cell));
    }
  }

  private flushWorldEdits(): void {
    const rebuilt = this.worldRenderer.flushDirtyRegions(Number.POSITIVE_INFINITY);
    if (rebuilt.length > 0) this.lastRebuiltRegions = rebuilt;
  }

  private syncVisualState(): void {
    const selected = this.state.inventory.selectedSlot;
    this.pickRoot.setEnabled(selected === 0);
    this.heldWall.setEnabled(selected === 1 && this.state.inventory.wallModules > 0);
    this.heldMembrane.setEnabled(selected === 2 && this.state.inventory.membraneModules > 0);
    this.cytoplasmFill.setEnabled(this.state.adapter.cytoplasm === 'filled');
    this.wallEvidenceMeshes.forEach((mesh) =>
      mesh.setEnabled(this.state.adapter.functionEvidence.cellWall),
    );
    this.membraneEvidenceMeshes.forEach((mesh) =>
      mesh.setEnabled(this.state.adapter.functionEvidence.cellMembrane),
    );
    this.syncActiveGhost();
  }

  private isInteractionTarget(): boolean {
    const phase = boundarySlicePhase(this.state);
    return (
      this.currentTarget === 'cytoplasm-control' ||
      (phase === 'inspect-wall' && this.currentTarget === 'installed-wall') ||
      (phase === 'inspect-membrane' && this.currentTarget === 'installed-membrane') ||
      (phase === 'reinspect-module' &&
        (this.currentTarget === 'installed-wall' || this.currentTarget === 'installed-membrane'))
    );
  }

  private emitSnapshot(): void {
    const renderer = this.worldRenderer.stats();
    const checkpoint = boundarySliceCheckpoint(this.state);
    this.callbacks.onSnapshot({
      state: cloneBoundarySliceState(this.state),
      phase: boundarySlicePhase(this.state),
      target: this.currentTarget,
      targetLabel: this.targetLabel,
      activeSector: this.activeSector()?.id ?? 'none',
      fps: this.currentFps,
      score: checkpoint.score.total,
      diagnostics: {
        world: '24x12x24',
        regionMeshes: renderer.regionMeshCount,
        lastRebuiltRegions: [...this.lastRebuiltRegions],
        totalRegionRebuilds: renderer.totalRebuilds,
        targetCell: pointLabel(this.currentHit?.cell ?? null),
        targetFace: faceLabel(this.currentHit?.normal ?? null),
        adjacentCell: pointLabel(this.currentHit?.adjacent ?? null),
        placementFailure: this.placement.failure ?? 'none',
        playerCell: pointLabel({
          x: Math.floor(this.playerPosition.x + 0.5),
          y: Math.floor(this.playerPosition.y + 0.5),
          z: Math.floor(this.playerPosition.z + 0.5),
        }),
        autoSteps: this.autoSteps,
        pickups: this.pickupPool.stats(),
        actionHeld: this.actionHeld,
        cytoplasmSolidCells: 0,
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

  setActionHeld(active: boolean): void {
    if (this.paused || this.stopped) return;
    this.actionHeld = active;
    this.actionTick = 0;
    if (active) {
      this.swingTime = 0.24;
    } else if (this.state.miningProgress > 0) {
      this.state = cancelBoundaryMining(this.state);
      this.emitSnapshot();
    }
  }

  place(): void {
    if (this.paused || this.stopped) return;
    const layer = this.activeLayer();
    const sectorId = this.placementSector?.id ?? null;
    if (!layer) {
      this.state = {
        ...cloneBoundarySliceState(this.state),
        feedback: 'No model module is ready to place.',
      };
      this.emitSnapshot();
      return;
    }
    const targetMatches =
      (layer === 'cellWall' && this.currentTarget === 'wall-anchor') ||
      (layer === 'cellMembrane' && this.currentTarget === 'membrane-anchor');
    const result = placeBoundarySliceModule(this.state, layer, targetMatches ? sectorId : null);
    this.state = result.state;
    if (result.event !== 'none' && result.sectorId) {
      const sector = BOUNDARY_SECTORS.find((candidate) => candidate.id === result.sectorId)!;
      this.installModuleGeometry(layer, sector);
      this.flushWorldEdits();
      this.currentTarget = null;
      this.targetLabel = '';
      this.placement = { valid: false, destination: null, failure: 'no-target' };
      this.placementSector = null;
    }
    this.syncVisualState();
    this.emitSnapshot();
  }

  interact(): void {
    if (this.paused || this.stopped) return;
    this.state = interactBoundarySlice(this.state, this.currentTarget);
    this.syncVisualState();
    this.emitSnapshot();
  }

  selectSlot(slot: number): void {
    if (this.paused || this.stopped) return;
    this.state = selectBoundarySlot(this.state, slot);
    this.syncVisualState();
    this.updateTarget();
    this.emitSnapshot();
  }

  recenter(): void {
    if (this.paused || this.stopped) return;
    const phase = boundarySlicePhase(this.state);
    let target: VoxelPoint | null = null;
    if (phase === 'mine-wall-supply') target = WALL_SUPPLY_CELL;
    else if (phase === 'mine-membrane-supply') target = MEMBRANE_SUPPLY_CELL;
    else if (phase === 'collect-wall-stack' || phase === 'collect-membrane-stack') {
      const pickup = this.pickupPool.entries.find((entry) => entry.active);
      target = pickup ? pickup.position : null;
    } else if (phase === 'collect-repair') {
      const pickup = this.pickupPool.entries.find((entry) => entry.active);
      target = pickup ? pickup.position : null;
    } else if (phase === 'inspect-wall') {
      target = BOUNDARY_SECTORS[0].wallAnchor;
    } else if (phase === 'inspect-membrane') {
      target = BOUNDARY_SECTORS[0].membraneAnchor;
    } else if (phase === 'reinspect-module' && this.state.repair) {
      const sector = BOUNDARY_SECTORS.find(
        (candidate) => candidate.id === this.state.repair?.sectorId,
      );
      target =
        this.state.repair.layer === 'cellWall'
          ? (sector?.wallAnchor ?? null)
          : (sector?.membraneAnchor ?? null);
    } else if (
      phase === 'activate-cytoplasm' &&
      this.state.inventory.selectedSlot === 0 &&
      this.state.adapter.membraneAnchors.length === BOUNDARY_SECTORS.length
    ) {
      target = BOUNDARY_SECTORS[BOUNDARY_SECTORS.length - 1].membraneAnchor;
    } else if (phase === 'activate-cytoplasm' || phase === 'inspect-cytoplasm') {
      target = CYTOPLASM_CONTROL_CELL;
    } else {
      const sector = this.activeSector();
      const layer = this.activeLayer();
      if (sector && layer) target = this.expectedBacking(sector, layer);
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
    this.actionHeld = false;
    this.actionTick = 0;
    this.pointerId = null;
    if (this.state.miningProgress > 0) {
      this.state = cancelBoundaryMining(this.state);
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
