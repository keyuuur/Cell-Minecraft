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
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.pure';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.pure';
import { Scene } from '@babylonjs/core/scene.pure';
import {
  advanceProofMining,
  cancelProofMining,
  collectProofDrop,
  initialProofState,
  placeProofWall,
  proofPhase,
  selectProofSlot,
  type ProofPhase,
  type ProofState,
  type ProofTarget,
} from './proofState';

export interface VoxelProofSnapshot {
  state: ProofState;
  phase: ProofPhase;
  target: ProofTarget;
  targetLabel: string;
  fps: number;
}

interface VoxelProofCallbacks {
  onSnapshot: (snapshot: VoxelProofSnapshot) => void;
  onContextLost: () => void;
}

const TARGET_LABELS: Record<Exclude<ProofTarget, null>, string> = {
  supply: 'WALL MODULE - MODEL SUPPLY',
  anchor: 'OUTER WALL ANCHOR - VALID',
  'placed-wall': 'INSTALLED WALL MODULE - REMOVE',
};

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
      if (pattern === 0 || pattern === 4) {
        context.fillStyle = pattern === 0 ? colors[1] : colors[2];
        context.fillRect(x * 4, y * 4, 4, 4);
      }
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

function thinInstanceBlocks(
  scene: Scene,
  name: string,
  positions: Vector3[],
  material: StandardMaterial,
  dimensions = { width: 0.98, height: 0.98, depth: 0.98 },
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

export class VoxelProofScene {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: VoxelProofCallbacks;
  private readonly keys = new Set<string>();
  private readonly toolRoot: TransformNode;
  private readonly pickRoot: TransformNode;
  private readonly heldWall: Mesh;
  private readonly outline: Mesh;
  private readonly anchor: Mesh;
  private readonly wallMaterial: StandardMaterial;
  private readonly reducedMotion: boolean;
  private state: ProofState = { ...initialProofState };
  private supplyTarget: Mesh | null = null;
  private pickup: Mesh | null = null;
  private wallVisual: Mesh | null = null;
  private wallTarget: Mesh | null = null;
  private joystick = { x: 0, z: 0 };
  private currentTarget: ProofTarget = null;
  private pointerId: number | null = null;
  private pointerPoint = { x: 0, y: 0 };
  private mineHeld = false;
  private mineTick = 0;
  private targetTick = 0;
  private swingTime = 0;
  private paused = false;
  private stopped = false;
  private disposed = false;
  private lastTime = performance.now();
  private lastFpsUpdate = 0;
  private currentFps = 0;

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
    this.scene.setRenderingAutoClearDepthStencil(3, true, true, true);

    this.camera = new UniversalCamera('voxel-proof-camera', new Vector3(0, 2.4, 8), this.scene);
    this.camera.minZ = 0.08;
    this.camera.maxZ = 48;
    this.camera.fov = 1.2;
    this.camera.inputs.clear();
    this.camera.setTarget(new Vector3(0, 1, 3.5));
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

    this.wallMaterial = pixelMaterial(this.scene, 'voxel-proof-wall', [
      '#79b85a',
      '#a9d17b',
      '#37653b',
    ]);
    this.createWorld();
    this.anchor = this.createAnchor();
    this.anchor.isVisible = false;
    this.anchor.isPickable = false;
    this.supplyTarget = this.createSupply();
    this.outline = this.createOutline();
    const tool = this.createTool();
    this.toolRoot = tool.root;
    this.pickRoot = tool.pick;
    this.heldWall = tool.heldWall;
    this.syncHeldItem();
    this.attachInput();

    canvas.addEventListener('webglcontextlost', this.handleContextLost, { passive: false });
    this.engine.runRenderLoop(() => this.render());
    this.emitSnapshot();
  }

  private createWorld(): void {
    const grass = pixelMaterial(this.scene, 'voxel-proof-grass', ['#6ebc52', '#86cf65', '#3d7b3f']);
    const soil = pixelMaterial(this.scene, 'voxel-proof-soil', ['#8a5a3b', '#a26e4b', '#5b3a2a']);
    const stone = pixelMaterial(this.scene, 'voxel-proof-stone', ['#6e7b78', '#899691', '#424d4b']);
    const path = pixelMaterial(this.scene, 'voxel-proof-path-material', [
      '#d5b878',
      '#ead094',
      '#9c8050',
    ]);
    const wood = pixelMaterial(this.scene, 'voxel-proof-wood', ['#9a6740', '#bd8554', '#6b442d']);
    const leaves = pixelMaterial(this.scene, 'voxel-proof-leaves', [
      '#438f55',
      '#60b66b',
      '#2d6943',
    ]);
    const foundation = pixelMaterial(this.scene, 'voxel-proof-foundation-material', [
      '#dfb65f',
      '#f0cf7a',
      '#bd8b3e',
    ]);

    const grassBlocks: Vector3[] = [];
    for (let x = -11; x <= 11; x += 1) {
      for (let z = -11; z <= 11; z += 1) {
        grassBlocks.push(new Vector3(x, -0.5, z));
      }
    }
    thinInstanceBlocks(this.scene, 'voxel-proof-grass-field', grassBlocks, grass);
    const groundBase = CreateBox(
      'voxel-proof-ground-base',
      { width: 23, height: 0.9, depth: 23 },
      this.scene,
    );
    groundBase.position.y = -0.98;
    groundBase.material = grass;
    groundBase.isPickable = false;

    const cliffBlocks: Vector3[] = [];
    for (let edge = -11; edge <= 11; edge += 1) {
      for (let y = 0; y <= 2; y += 1) {
        cliffBlocks.push(new Vector3(-11, y + 0.5, edge));
        cliffBlocks.push(new Vector3(11, y + 0.5, edge));
      }
    }
    for (let edge = -10; edge <= 10; edge += 1) {
      cliffBlocks.push(new Vector3(edge, 0.5, -11));
      cliffBlocks.push(new Vector3(edge, 1.5, -11));
    }
    thinInstanceBlocks(this.scene, 'voxel-proof-soil-cliffs', cliffBlocks, soil);

    const pathBlocks: Vector3[] = [];
    for (let z = -1; z <= 10; z += 1) {
      for (let x = -1; x <= 1; x += 1) pathBlocks.push(new Vector3(x, 0.02, z));
    }
    thinInstanceBlocks(this.scene, 'voxel-proof-path', pathBlocks, path, {
      width: 0.92,
      height: 0.08,
      depth: 0.92,
    });

    const foundationBlocks: Vector3[] = [];
    for (let x = -4; x <= 4; x += 1) {
      for (let z = -8; z <= -2; z += 1) {
        foundationBlocks.push(new Vector3(x, 0.08, z));
      }
    }
    thinInstanceBlocks(this.scene, 'voxel-proof-cell-foundation', foundationBlocks, foundation, {
      width: 0.94,
      height: 0.14,
      depth: 0.94,
    });

    const frameBlocks: Vector3[] = [];
    for (let z = -8; z <= -2; z += 1) {
      frameBlocks.push(new Vector3(-5, 0.5, z));
      frameBlocks.push(new Vector3(5, 0.5, z));
    }
    for (let x = -5; x <= 5; x += 1) frameBlocks.push(new Vector3(x, 0.5, -9));
    for (const [x, z] of [
      [-5, -9],
      [5, -9],
      [-5, -2],
      [5, -2],
    ]) {
      for (let y = 1; y <= 4; y += 1) frameBlocks.push(new Vector3(x, y + 0.5, z));
    }
    thinInstanceBlocks(this.scene, 'voxel-proof-cell-frame', frameBlocks, stone);

    const trunkBlocks = [
      new Vector3(-8, 0.5, 2),
      new Vector3(-8, 1.5, 2),
      new Vector3(8, 0.5, -4),
      new Vector3(8, 1.5, -4),
      new Vector3(7, 0.5, 7),
      new Vector3(7, 1.5, 7),
    ];
    const leafBlocks: Vector3[] = [];
    for (const [x, z] of [
      [-8, 2],
      [8, -4],
      [7, 7],
    ]) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          leafBlocks.push(new Vector3(x + dx, 2.5, z + dz));
        }
      }
      leafBlocks.push(new Vector3(x, 3.5, z));
    }
    thinInstanceBlocks(this.scene, 'voxel-proof-tree-trunks', trunkBlocks, wood);
    thinInstanceBlocks(this.scene, 'voxel-proof-tree-leaves', leafBlocks, leaves);

    const cloudMaterial = flatMaterial(this.scene, 'voxel-proof-clouds', '#f4fbff');
    const cloudBlocks = [
      new Vector3(-8, 9, -17),
      new Vector3(-6, 9, -17),
      new Vector3(-4, 9, -17),
      new Vector3(6, 11, -20),
      new Vector3(8, 11, -20),
    ];
    thinInstanceBlocks(this.scene, 'voxel-proof-cloud-blocks', cloudBlocks, cloudMaterial, {
      width: 2,
      height: 0.7,
      depth: 0.8,
    });

    const sunMaterial = flatMaterial(this.scene, 'voxel-proof-sun-material', '#ffe59a');
    const blockSun = CreateBox(
      'voxel-proof-square-sun',
      { width: 2.8, height: 2.8, depth: 0.18 },
      this.scene,
    );
    blockSun.position = new Vector3(-13, 14, -22);
    blockSun.material = sunMaterial;
    blockSun.isPickable = false;
  }

  private createSupply(): Mesh {
    const target = CreateBox('voxel-proof-wall-supply', { size: 1.25 }, this.scene);
    target.position = new Vector3(0, 0.65, 3.5);
    target.material = this.wallMaterial;
    target.metadata = { proofTarget: 'supply' satisfies ProofTarget };
    target.isPickable = true;
    return target;
  }

  private createAnchor(): Mesh {
    const anchor = CreateBox(
      'voxel-proof-wall-anchor',
      { width: 3.05, height: 3.05, depth: 0.42 },
      this.scene,
    );
    anchor.position = new Vector3(0, 1.55, -1.5);
    const material = flatMaterial(this.scene, 'voxel-proof-anchor-material', '#b7e45a', 0.34);
    material.wireframe = true;
    material.disableDepthWrite = true;
    anchor.material = material;
    anchor.metadata = { proofTarget: 'anchor' satisfies ProofTarget };
    anchor.isPickable = true;
    anchor.renderingGroupId = 2;
    return anchor;
  }

  private createOutline(): Mesh {
    const outline = CreateBox('voxel-proof-target-outline', { size: 1 }, this.scene);
    const material = flatMaterial(this.scene, 'voxel-proof-outline-material', '#fff2b0', 0.95);
    material.wireframe = true;
    material.disableDepthWrite = true;
    outline.material = material;
    outline.isPickable = false;
    outline.visibility = 0;
    outline.renderingGroupId = 3;
    return outline;
  }

  private createTool(): { root: TransformNode; pick: TransformNode; heldWall: Mesh } {
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

    const heldWall = CreateBox('voxel-proof-held-wall', { size: 0.5 }, this.scene);
    heldWall.parent = root;
    heldWall.position = new Vector3(-0.1, 0.1, 0);
    heldWall.material = this.wallMaterial;
    heldWall.isPickable = false;

    for (const mesh of [hand, grip, pickHead, pickTip, heldWall]) {
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
    }
    return { root, pick, heldWall };
  }

  private createWall(): void {
    const blocks: Vector3[] = [];
    for (let x = -1; x <= 1; x += 1) {
      for (let y = 0; y <= 2; y += 1) blocks.push(new Vector3(x, y + 0.55, -1.5));
    }
    this.wallVisual = thinInstanceBlocks(
      this.scene,
      'voxel-proof-installed-wall',
      blocks,
      this.wallMaterial,
      { width: 0.94, height: 0.94, depth: 0.46 },
    );
    const targetMaterial = flatMaterial(
      this.scene,
      'voxel-proof-wall-target-material',
      '#ffffff',
      0,
    );
    targetMaterial.disableDepthWrite = true;
    this.wallTarget = CreateBox(
      'voxel-proof-installed-wall-target',
      { width: 3.05, height: 3.05, depth: 0.5 },
      this.scene,
    );
    this.wallTarget.position.copyFrom(this.anchor.position);
    this.wallTarget.material = targetMaterial;
    this.wallTarget.visibility = 0.001;
    this.wallTarget.metadata = { proofTarget: 'placed-wall' satisfies ProofTarget };
    this.wallTarget.isPickable = true;
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
    this.camera.rotation.x = Math.max(-0.76, Math.min(0.62, this.camera.rotation.x + dy * 0.0032));
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
      this.updatePickup(deltaSeconds, now);
      this.updateTool(deltaSeconds);
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
    this.camera.position.addInPlace(movement);
    this.camera.position.x = Math.max(-9.5, Math.min(9.5, this.camera.position.x));
    this.camera.position.z = Math.max(-9.5, Math.min(10.5, this.camera.position.z));
    this.camera.position.y = 2.4;
  }

  private updateTarget(): void {
    const hit = this.scene.pickWithRay(
      this.camera.getForwardRay(5),
      (mesh) => Boolean(mesh.isPickable && mesh.metadata?.proofTarget),
      false,
    );
    const mesh = hit?.hit ? hit.pickedMesh : null;
    const target = (mesh?.metadata?.proofTarget as ProofTarget | undefined) ?? null;
    if (target !== this.currentTarget) {
      this.currentTarget = target;
      this.state = cancelProofMining(this.state);
      if (target === 'anchor' && this.state.selectedSlot === 1 && this.state.inventoryCount > 0) {
        this.state = {
          ...this.state,
          feedback: 'Valid outer wall anchor targeted. Press Place.',
        };
      } else if (target === 'supply' && this.state.selectedSlot === 0) {
        this.state = {
          ...this.state,
          feedback: 'Wall Module supply targeted. Hold Mine.',
        };
      } else if (target === 'placed-wall' && this.state.selectedSlot === 0) {
        this.state = {
          ...this.state,
          feedback: 'Installed wall targeted. Hold Remove.',
        };
      }
      this.mineHeld = false;
      this.emitSnapshot();
    }
    this.updateOutline(mesh, target);
  }

  private updateOutline(mesh: AbstractMesh | null, target: ProofTarget): void {
    if (!mesh || !target) {
      this.outline.visibility = 0;
      return;
    }
    this.outline.position.copyFrom(
      target === 'supply' ? new Vector3(0, 0.65, 3.5) : this.anchor.position,
    );
    this.outline.scaling.copyFrom(
      target === 'supply' ? new Vector3(1.34, 1.34, 1.34) : new Vector3(3.18, 3.18, 0.58),
    );
    this.outline.visibility = 1;
  }

  private updateMining(deltaSeconds: number): void {
    if (!this.mineHeld) return;
    this.mineTick += deltaSeconds;
    if (this.mineTick < 0.06) return;
    const amount = this.mineTick / 0.72;
    this.mineTick = 0;
    this.advanceMining(amount);
  }

  private updatePickup(deltaSeconds: number, now: number): void {
    if (!this.pickup) return;
    this.pickup.rotation.y += deltaSeconds * 1.8;
    this.pickup.position.y = 0.76 + Math.sin(now * 0.004) * 0.11;
    const dx = this.camera.position.x - this.pickup.position.x;
    const dz = this.camera.position.z - this.pickup.position.z;
    if (Math.hypot(dx, dz) > 0.95) return;
    this.pickup.dispose();
    this.pickup = null;
    this.state = collectProofDrop(this.state);
    this.anchor.isVisible = true;
    this.anchor.isPickable = true;
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
    const result = advanceProofMining(this.state, this.currentTarget, amount);
    this.state = result.state;
    if (result.event === 'supply-broken' && this.supplyTarget) {
      const position = this.supplyTarget.position.clone();
      this.supplyTarget.dispose();
      this.supplyTarget = null;
      this.spawnPickup(position);
      this.mineHeld = false;
    }
    if (result.event === 'wall-removed' && this.wallVisual && this.wallTarget) {
      this.wallVisual.dispose();
      this.wallVisual = null;
      this.wallTarget.dispose();
      this.wallTarget = null;
      this.anchor.isVisible = true;
      this.anchor.isPickable = true;
      this.spawnPickup(new Vector3(0, 0.76, -0.65));
      this.mineHeld = false;
    }
    this.emitSnapshot();
  }

  private spawnPickup(position: Vector3): void {
    this.pickup?.dispose();
    this.pickup = CreateBox('voxel-proof-wall-module-drop', { size: 0.56 }, this.scene);
    this.pickup.position = new Vector3(position.x, 0.76, position.z);
    this.pickup.material = this.wallMaterial;
    this.pickup.isPickable = false;
  }

  private syncHeldItem(): void {
    const pickSelected = this.state.selectedSlot === 0;
    this.pickRoot.setEnabled(pickSelected);
    this.heldWall.setEnabled(!pickSelected && this.state.inventoryCount > 0);
  }

  private emitSnapshot(): void {
    this.syncHeldItem();
    this.callbacks.onSnapshot({
      state: { ...this.state },
      phase: proofPhase(this.state),
      target: this.currentTarget,
      targetLabel: this.currentTarget ? TARGET_LABELS[this.currentTarget] : '',
      fps: this.currentFps,
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
    const result = placeProofWall(this.state, this.currentTarget);
    this.state = result.state;
    if (result.event !== 'none') {
      this.anchor.isVisible = false;
      this.anchor.isPickable = false;
      this.wallVisual?.dispose();
      this.wallTarget?.dispose();
      this.createWall();
    }
    this.emitSnapshot();
  }

  selectSlot(slot: number): void {
    if (this.paused || this.stopped) return;
    this.state = selectProofSlot(this.state, slot);
    this.syncHeldItem();
    this.emitSnapshot();
  }

  recenter(): void {
    if (this.paused || this.stopped) return;
    const target = this.state.supplyAvailable
      ? new Vector3(0, 0.65, 3.5)
      : new Vector3(0, 1.55, -1.5);
    this.camera.setTarget(target);
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
    this.scene.dispose();
    this.engine.dispose();
  }
}
