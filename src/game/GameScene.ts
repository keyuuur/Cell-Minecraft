import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera.pure';
import { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.pure';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.pure';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.pure';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.pure';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.pure';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.pure';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.pure';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.pure';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.pure';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.pure';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.pure';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.pure';
import { Scene } from '@babylonjs/core/scene.pure';
import { activeStationIds, assessPlacement } from '../biology/rules';
import type { NearbyStation, NearbyStructure, PlacementPreview } from '../state/gameStore';
import type {
  MissionState,
  PlaceableStructureId,
  Point3,
  QualityMode,
  StructureId,
} from '../types/game';
import { FixedGrid } from './FixedGrid';

interface GameSceneCallbacks {
  onNearbyStation: (station: NearbyStation) => void;
  onNearbyStructure: (structure: NearbyStructure) => void;
  onPlacementPreview: (preview: PlacementPreview | null) => void;
  onFps: (fps: number) => void;
  onContextLost: () => void;
}

const stationPositions: Array<{
  id: StructureId | 'waterStation';
  label: string;
  position: Vector3;
  color: Color3;
}> = [
  {
    id: 'cellWall',
    label: 'CELL WALL',
    position: new Vector3(-15, 1, 8),
    color: Color3.FromHexString('#79b85a'),
  },
  {
    id: 'cellMembrane',
    label: 'MEMBRANE',
    position: new Vector3(-15, 1, 1),
    color: Color3.FromHexString('#62b5d4'),
  },
  {
    id: 'cytoplasm',
    label: 'CYTOPLASM',
    position: new Vector3(-15, 1, -7),
    color: Color3.FromHexString('#e1bd61'),
  },
  {
    id: 'nucleus',
    label: 'NUCLEUS',
    position: new Vector3(15, 1, 9),
    color: Color3.FromHexString('#a986cf'),
  },
  {
    id: 'ribosomes',
    label: 'RIBOSOMES',
    position: new Vector3(15, 1, 5),
    color: Color3.FromHexString('#d7d6d1'),
  },
  {
    id: 'mitochondria',
    label: 'MITOCHONDRIA',
    position: new Vector3(15, 1, 1),
    color: Color3.FromHexString('#ef8b63'),
  },
  {
    id: 'chloroplasts',
    label: 'CHLOROPLASTS',
    position: new Vector3(15, 1, -3),
    color: Color3.FromHexString('#58a85b'),
  },
  {
    id: 'centralVacuole',
    label: 'CENTRAL VACUOLE',
    position: new Vector3(15, 1, -7),
    color: Color3.FromHexString('#5bc0d0'),
  },
  {
    id: 'waterStation',
    label: 'WATER SUPPLY',
    position: new Vector3(0, 1, -17),
    color: Color3.FromHexString('#3f9ee8'),
  },
];

function standardMaterial(scene: Scene, name: string, color: Color3, alpha = 1): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.alpha = alpha;
  material.specularColor = Color3.Black();
  return material;
}

export class GameScene {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: UniversalCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly keys = new Set<string>();
  private readonly missionRoot: TransformNode;
  private readonly callbacks: GameSceneCallbacks;
  private readonly occupancy = new FixedGrid(24, 12, 24);
  private readonly stationMaterials = new Map<string, StandardMaterial>();
  private readonly stationLabelTextures = new Map<string, DynamicTexture>();
  private readonly stationLabelMaterials = new Map<string, StandardMaterial>();
  private readonly stationLabelMeshes = new Map<string, ReturnType<typeof CreatePlane>>();
  private missionMaterials: StandardMaterial[] = [];
  private missionTextures: DynamicTexture[] = [];
  private currentMission: MissionState | null = null;
  private preview: ReturnType<typeof CreateBox> | null = null;
  private previewMaterial: StandardMaterial | null = null;
  private previewValidMarker: ReturnType<typeof CreateTorus> | null = null;
  private previewBlockedMarkers: Array<ReturnType<typeof CreateBox>> = [];
  private lastPlacementPreviewKey = '';
  private selectedItem: StructureId | null = null;
  private joystick = { x: 0, z: 0 };
  private lastNearby: NearbyStation = null;
  private lastNearbyStructure: NearbyStructure = null;
  private preferredStructure: PlaceableStructureId | null = null;
  private lastSemanticUpdate = 0;
  private lastFpsUpdate = 0;
  private pointerId: number | null = null;
  private pointerPoint = { x: 0, y: 0 };
  private disposed = false;
  private paused = false;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: GameSceneCallbacks,
    qualityMode: QualityMode,
    stressMode = false,
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.engine = new Engine(
      canvas,
      true,
      {
        preserveDrawingBuffer: false,
        stencil: false,
        powerPreference: qualityMode === 'low' ? 'low-power' : 'high-performance',
        adaptToDeviceRatio: false,
      },
      true,
    );
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.055, 0.11, 0.1, 1);
    this.scene.skipPointerMovePicking = true;
    this.missionRoot = new TransformNode('mission-root', this.scene);

    this.camera = new UniversalCamera('player-camera', new Vector3(-18, 2.4, 10), this.scene);
    this.camera.minZ = 0.1;
    this.camera.fov = 1.05;
    this.camera.rotation = new Vector3(0, 2.16, 0);
    this.camera.inputs.clear();
    this.scene.activeCamera = this.camera;

    const light = new HemisphericLight('soft-lab-light', new Vector3(0.2, 1, -0.3), this.scene);
    light.intensity = qualityMode === 'low' ? 1.15 : 1.35;

    this.createLab();
    if (stressMode) this.createStressScene();
    this.attachInput(canvas);
    this.setQuality(qualityMode);

    canvas.addEventListener('webglcontextlost', this.handleContextLost, { passive: false });
    this.engine.runRenderLoop(() => this.render());
  }

  private createStressScene(): void {
    const block = CreateBox('stress-block-source', { size: 0.9 }, this.scene);
    block.material = standardMaterial(
      this.scene,
      'stress-block-material',
      Color3.FromHexString('#728f7f'),
    );
    const matrices: number[] = [];
    for (let x = 0; x < 32; x += 1) {
      for (let z = 0; z < 32; z += 1) {
        Matrix.Translation(x - 16, 0.8, z - 16).copyToArray(matrices, matrices.length);
      }
    }
    for (let y = 1; y < 20; y += 1) {
      for (let edge = 0; edge < 32; edge += 1) {
        for (const [x, z] of [
          [edge - 16, -16],
          [edge - 16, 15],
          [-16, edge - 16],
          [15, edge - 16],
        ]) {
          Matrix.Translation(x, y + 0.8, z).copyToArray(matrices, matrices.length);
        }
      }
    }
    block.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, true);
    this.camera.position = new Vector3(0, 10, -19);
  }

  private missionMaterial(name: string, color: Color3, alpha = 1): StandardMaterial {
    const material = standardMaterial(this.scene, name, color, alpha);
    this.missionMaterials.push(material);
    return material;
  }

  private missionBillboard(name: string, text: string, position: Vector3, color: string): void {
    const texture = new DynamicTexture(
      `${name}-texture`,
      { width: 768, height: 128 },
      this.scene,
      false,
    );
    texture.hasAlpha = true;
    texture.drawText(text, null, 84, 'bold 36px Arial', '#07110f', color, true, true);
    this.missionTextures.push(texture);
    const material = this.missionMaterial(`${name}-material`, Color3.White());
    material.diffuseTexture = texture;
    material.emissiveColor = Color3.White();
    material.backFaceCulling = false;
    const label = CreatePlane(name, { width: 7.6, height: 1.25 }, this.scene);
    label.parent = this.missionRoot;
    label.position = position;
    label.billboardMode = 7;
    label.material = material;
  }

  private createLab(): void {
    const floor = CreateGround('lab-floor', { width: 42, height: 42, subdivisions: 1 }, this.scene);
    floor.material = standardMaterial(
      this.scene,
      'floor-material',
      Color3.FromHexString('#253a35'),
    );

    const chamberFloor = CreateBox(
      'construction-floor',
      { width: 24, depth: 24, height: 0.35 },
      this.scene,
    );
    chamberFloor.position.y = 0.17;
    chamberFloor.material = standardMaterial(
      this.scene,
      'chamber-floor-material',
      Color3.FromHexString('#53675d'),
    );

    const gridMaterial = standardMaterial(
      this.scene,
      'grid-material',
      Color3.FromHexString('#8ca99a'),
      0.34,
    );
    for (let offset = -12; offset <= 12; offset += 4) {
      const lineX = CreateBox(
        `grid-x-${offset}`,
        { width: 24, depth: 0.035, height: 0.02 },
        this.scene,
      );
      lineX.position = new Vector3(0, 0.37, offset);
      lineX.material = gridMaterial;
      const lineZ = CreateBox(
        `grid-z-${offset}`,
        { width: 0.035, depth: 24, height: 0.02 },
        this.scene,
      );
      lineZ.position = new Vector3(offset, 0.37, 0);
      lineZ.material = gridMaterial;
    }

    for (const station of stationPositions) {
      const depot = CreateBox(
        `station-${station.id}`,
        { width: 2.8, height: 2, depth: 2.8 },
        this.scene,
      );
      depot.position.copyFrom(station.position);
      const depotMaterial = standardMaterial(
        this.scene,
        `station-material-${station.id}`,
        station.color,
      );
      depot.material = depotMaterial;
      this.stationMaterials.set(station.id, depotMaterial);

      const beacon = CreateCylinder(
        `beacon-${station.id}`,
        { height: 4.8, diameter: 0.18, tessellation: 8 },
        this.scene,
      );
      beacon.position = station.position.add(new Vector3(0, 3.2, 0));
      beacon.material = standardMaterial(
        this.scene,
        `beacon-material-${station.id}`,
        station.color,
        0.72,
      );

      const labelTexture = new DynamicTexture(
        `station-label-texture-${station.id}`,
        { width: 512, height: 128 },
        this.scene,
        false,
      );
      labelTexture.hasAlpha = true;
      labelTexture.drawText(
        station.label,
        null,
        82,
        'bold 44px Arial',
        '#ffffff',
        '#102a24',
        true,
        true,
      );
      const labelMaterial = standardMaterial(
        this.scene,
        `station-label-material-${station.id}`,
        Color3.White(),
      );
      labelMaterial.diffuseTexture = labelTexture;
      labelMaterial.emissiveColor = Color3.White();
      labelMaterial.backFaceCulling = false;
      this.stationLabelTextures.set(station.id, labelTexture);
      this.stationLabelMaterials.set(station.id, labelMaterial);
      const label = CreatePlane(
        `station-label-${station.id}`,
        { width: 4.4, height: 0.96 },
        this.scene,
      );
      label.position = station.position.add(new Vector3(0, 4, 0));
      label.billboardMode = 7;
      label.material = labelMaterial;
      this.stationLabelMeshes.set(station.id, label);
    }

    const wallMaterial = standardMaterial(
      this.scene,
      'lab-wall-material',
      Color3.FromHexString('#172824'),
    );
    const backWall = CreateBox('lab-back-wall', { width: 42, height: 8, depth: 0.3 }, this.scene);
    backWall.position = new Vector3(0, 4, 21);
    backWall.material = wallMaterial;
  }

  private attachInput(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerRelease);
    canvas.addEventListener('pointercancel', this.handlePointerRelease);
    canvas.addEventListener('lostpointercapture', this.handlePointerRelease);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const element = event.target as HTMLElement | null;
    if (element?.closest('input, select, textarea, button, dialog')) return;
    if (
      ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(
        event.key.toLowerCase(),
      )
    ) {
      event.preventDefault();
      this.keys.add(event.key.toLowerCase());
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  private handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.pointerPoint = { x: event.clientX, y: event.clientY };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser checks have no active hardware pointer to capture.
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.paused || this.pointerId !== event.pointerId) return;
    const dx = event.clientX - this.pointerPoint.x;
    const dy = event.clientY - this.pointerPoint.y;
    this.pointerPoint = { x: event.clientX, y: event.clientY };
    this.camera.rotation.y += dx * 0.0045;
    this.camera.rotation.x = Math.max(-0.82, Math.min(0.65, this.camera.rotation.x + dy * 0.0035));
  };

  private handlePointerRelease = (event: PointerEvent): void => {
    if (this.pointerId === event.pointerId) this.pointerId = null;
  };

  private render(): void {
    if (this.disposed) return;
    const now = performance.now();
    const delta = Math.min(this.engine.getDeltaTime(), 50) / 1000;
    const forward = this.camera.getDirection(Vector3.Forward());
    forward.y = 0;
    forward.normalize();
    const right = this.camera.getDirection(Vector3.Right());
    right.y = 0;
    right.normalize();
    let z = this.joystick.z;
    let x = this.joystick.x;
    if (this.keys.has('w') || this.keys.has('arrowup')) z += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    const movement = forward.scale(z).add(right.scale(x));
    if (!this.paused && movement.lengthSquared() > 0.001) {
      movement.normalize().scaleInPlace(7 * delta);
      this.camera.position.addInPlace(movement);
      this.camera.position.x = Math.max(-19, Math.min(19, this.camera.position.x));
      this.camera.position.z = Math.max(-19, Math.min(19, this.camera.position.z));
      this.camera.position.y = 2.4;
    }

    if (now - this.lastSemanticUpdate > 180) {
      this.lastSemanticUpdate = now;
      let nearby: NearbyStation = null;
      let distance = 4.4;
      for (const station of stationPositions) {
        const stationDistance = Vector3.Distance(this.camera.position, station.position);
        if (stationDistance < distance) {
          nearby = station.id;
          distance = stationDistance;
        }
      }
      if (nearby !== this.lastNearby) {
        this.lastNearby = nearby;
        this.callbacks.onNearbyStation(nearby);
      }
      let nearbyStructure: NearbyStructure = null;
      let structureDistance = 4.2;
      if (this.currentMission) {
        const preferredPlacement = this.preferredStructure
          ? this.currentMission.placements[this.preferredStructure]
          : undefined;
        if (preferredPlacement) {
          const distanceToPreferred = Math.hypot(
            this.camera.position.x - preferredPlacement.position.x,
            this.camera.position.z - preferredPlacement.position.z,
          );
          const preferredInspectDistance = preferredPlacement.id === 'centralVacuole' ? 10.5 : 4.5;
          if (distanceToPreferred < preferredInspectDistance) {
            nearbyStructure = preferredPlacement.id;
          }
        }
        if (!nearbyStructure) {
          for (const placement of Object.values(this.currentMission.placements)) {
            if (!placement) continue;
            const distanceToPlacement = Math.hypot(
              this.camera.position.x - placement.position.x,
              this.camera.position.z - placement.position.z,
            );
            if (distanceToPlacement < structureDistance) {
              nearbyStructure = placement.id;
              structureDistance = distanceToPlacement;
            }
          }
        }
        if (!nearbyStructure) {
          const radius = Math.hypot(this.camera.position.x, this.camera.position.z);
          if (this.currentMission.membranePanels === 6 && Math.abs(radius - 9.65) < 0.62) {
            nearbyStructure = 'cellMembrane';
          } else if (this.currentMission.wallPanels === 6 && Math.abs(radius - 10.5) < 0.7) {
            nearbyStructure = 'cellWall';
          } else if (this.currentMission.cytoplasmEstablished && radius < 8) {
            nearbyStructure = 'cytoplasm';
          }
        }
      }
      if (nearbyStructure !== this.lastNearbyStructure) {
        this.lastNearbyStructure = nearbyStructure;
        this.callbacks.onNearbyStructure(nearbyStructure);
      }
    }
    if (this.preview && this.previewMaterial && this.currentMission && this.selectedItem) {
      const position = this.getPlacementPosition();
      this.preview.position = new Vector3(position.x, 0.5, position.z);
      this.previewValidMarker?.position.copyFrom(this.preview.position);
      this.previewBlockedMarkers.forEach((marker) =>
        marker.position.copyFrom(this.preview!.position),
      );
      const placement = assessPlacement(this.currentMission, this.selectedItem, position);
      const color = Color3.FromHexString(placement.allowed ? '#a9ef69' : '#f06f5f');
      this.previewMaterial.diffuseColor = color;
      this.previewMaterial.emissiveColor = color.scale(0.45);
      if (this.previewValidMarker) this.previewValidMarker.isVisible = placement.allowed;
      this.previewBlockedMarkers.forEach((marker) => {
        marker.isVisible = !placement.allowed;
      });
      const preview: PlacementPreview = {
        status: placement.allowed ? 'valid' : 'blocked',
        reason: placement.reason,
        zoneLabel: placement.zoneLabel,
      };
      const previewKey = JSON.stringify(preview);
      if (previewKey !== this.lastPlacementPreviewKey) {
        this.lastPlacementPreviewKey = previewKey;
        this.callbacks.onPlacementPreview(preview);
      }
    }
    if (now - this.lastFpsUpdate > 1000) {
      this.lastFpsUpdate = now;
      this.callbacks.onFps(Math.round(this.engine.getFps()));
    }
    this.scene.render();
  }

  syncMission(mission: MissionState): void {
    this.currentMission = mission;
    this.preferredStructure =
      Object.values(mission.placements)
        .filter((placement): placement is NonNullable<typeof placement> => Boolean(placement))
        .sort((left, right) => right.placedAt - left.placedAt)[0]?.id ?? null;
    this.occupancy.clear();
    for (let index = 0; index < mission.wallPanels; index += 1) {
      this.occupancy.set(index * 4, 1, 0, 1);
    }
    for (let index = 0; index < mission.membranePanels; index += 1) {
      this.occupancy.set(index * 4, 2, 1, 2);
    }
    this.missionRoot.getChildMeshes().forEach((mesh) => mesh.dispose());
    this.missionMaterials.forEach((material) => material.dispose());
    this.missionTextures.forEach((texture) => texture.dispose());
    this.missionMaterials = [];
    this.missionTextures = [];
    const activeStations = new Set(activeStationIds(mission));
    for (const [id, material] of this.stationMaterials) {
      const active = activeStations.has(id as StructureId | 'waterStation');
      material.alpha = activeStations.size === 0 || active ? 1 : 0.38;
      material.emissiveColor = active ? material.diffuseColor.scale(0.38) : Color3.Black();
      const station = stationPositions.find((candidate) => candidate.id === id);
      const texture = this.stationLabelTextures.get(id);
      const labelMaterial = this.stationLabelMaterials.get(id);
      const labelMesh = this.stationLabelMeshes.get(id);
      if (station && texture && labelMaterial && labelMesh) {
        const label = active ? `NEXT: ${station.label}` : station.label;
        texture.drawText(
          label,
          null,
          80,
          `bold ${label.length > 19 ? 27 : label.length > 14 ? 31 : 37}px Arial`,
          active ? '#102a24' : '#ffffff',
          active ? '#d9ff63' : '#102a24',
          true,
          true,
        );
        labelMaterial.alpha = activeStations.size === 0 || active ? 1 : 0.55;
        labelMesh.position.y = station.position.y + (active ? 5.1 : 4);
        labelMesh.scaling.x = active ? 1.2 : 1;
        labelMesh.scaling.y = active ? 1.08 : 1;
      }
    }
    for (const activeStation of activeStations) {
      const target = stationPositions.find((station) => station.id === activeStation);
      if (target) {
        const markerMaterial = this.missionMaterial(
          `active-depot-marker-material-${activeStation}`,
          Color3.FromHexString('#d9ff63'),
        );
        markerMaterial.emissiveColor = Color3.FromHexString('#9ec73d');
        for (const [index, diameter] of [4.1, 4.8].entries()) {
          const marker = CreateTorus(
            `active-depot-marker-${activeStation}-${index}`,
            { diameter, thickness: index === 0 ? 0.2 : 0.1, tessellation: 24 },
            this.scene,
          );
          marker.parent = this.missionRoot;
          marker.position = target.position.add(new Vector3(0, 0.15, 0));
          marker.material = markerMaterial;
        }
        for (const side of [-1, 1]) {
          const chevron = CreateBox(
            `active-depot-chevron-${activeStation}-${side}`,
            { width: 0.18, height: 0.08, depth: 1.2 },
            this.scene,
          );
          chevron.parent = this.missionRoot;
          chevron.position = target.position.add(new Vector3(side * 2.35, 0.18, 0));
          chevron.rotation.y = side * 0.7;
          chevron.material = markerMaterial;
        }
      }
    }
    const wall = this.missionMaterial('cell-wall', Color3.FromHexString('#609347'), 0.38);
    const wallBrace = this.missionMaterial(
      'cell-wall-brace',
      Color3.FromHexString('#609347'),
      0.92,
    );
    const membrane = this.missionMaterial('cell-membrane', Color3.FromHexString('#4ba7bb'), 0.28);
    if (mission.functionEvidence.cellWall) {
      wall.emissiveColor = Color3.FromHexString('#355d24');
      wallBrace.emissiveColor = Color3.FromHexString('#355d24');
    }
    if (mission.functionEvidence.cellMembrane)
      membrane.emissiveColor = Color3.FromHexString('#185267');
    const segmentWidth = 7.2;
    const makeRing = (
      count: number,
      radius: number,
      material: StandardMaterial,
      prefix: string,
      depth: number,
    ) => {
      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / 6;
        const panel = CreateBox(
          `${prefix}-${index}`,
          { width: segmentWidth, height: 6, depth },
          this.scene,
        );
        panel.parent = this.missionRoot;
        panel.position = new Vector3(Math.sin(angle) * radius, 3.2, Math.cos(angle) * radius);
        panel.rotation.y = angle;
        panel.material = material;
        if (prefix === 'wall-panel') {
          for (const offset of [-2.6, 2.6]) {
            const brace = CreateBox(
              `${prefix}-brace-${index}-${offset}`,
              { width: 0.32, height: 6.4, depth: 0.82 },
              this.scene,
            );
            brace.parent = this.missionRoot;
            brace.position = panel.position.add(
              new Vector3(Math.cos(angle) * offset, 0, -Math.sin(angle) * offset),
            );
            brace.rotation.y = angle;
            brace.material = wallBrace;
          }
        } else {
          for (const verticalOffset of [-1.5, 1.5]) {
            const band = CreateBox(
              `${prefix}-band-${index}-${verticalOffset}`,
              { width: segmentWidth, height: 0.16, depth: 0.36 },
              this.scene,
            );
            band.parent = this.missionRoot;
            band.position = panel.position.add(new Vector3(0, verticalOffset, 0));
            band.rotation.y = angle;
            band.material = material;
          }
        }
      }
    };
    makeRing(mission.wallPanels, 10.5, wall, 'wall-panel', 0.76);
    makeRing(mission.membranePanels, 9.65, membrane, 'membrane-panel', 0.2);

    const selectedZone = this.selectedItem;
    const wallZoneMaterial = this.missionMaterial(
      'wall-zone-guide-material',
      selectedZone === 'cellWall'
        ? Color3.FromHexString('#d9ff63')
        : Color3.FromHexString('#78926d'),
      selectedZone === 'cellWall' ? 0.72 : 0.28,
    );
    const membraneZoneMaterial = this.missionMaterial(
      'membrane-zone-guide-material',
      selectedZone === 'cellMembrane'
        ? Color3.FromHexString('#d9ff63')
        : Color3.FromHexString('#67b6d1'),
      selectedZone === 'cellMembrane' ? 0.72 : 0.28,
    );
    for (const [name, diameter, thickness, material] of [
      ['outer-wall-zone', 21, 0.32, wallZoneMaterial],
      ['inner-membrane-zone-a', 19.4, 0.12, membraneZoneMaterial],
      ['inner-membrane-zone-b', 18.8, 0.12, membraneZoneMaterial],
    ] as const) {
      const guide = CreateTorus(name, { diameter, thickness, tessellation: 32 }, this.scene);
      guide.parent = this.missionRoot;
      guide.position.y = 0.46;
      guide.material = material;
    }
    const centralGuideMaterial = this.missionMaterial(
      'central-zone-guide-material',
      selectedZone === 'centralVacuole'
        ? Color3.FromHexString('#d9ff63')
        : Color3.FromHexString('#5bc0d0'),
      selectedZone === 'centralVacuole' ? 0.78 : 0.24,
    );
    for (const x of [-4, 4]) {
      for (const z of [-4, 4]) {
        const bracket = CreateBox(
          `central-zone-bracket-${x}-${z}`,
          { width: 1.3, height: 0.08, depth: 0.28 },
          this.scene,
        );
        bracket.parent = this.missionRoot;
        bracket.position = new Vector3(x, 0.48, z);
        bracket.rotation.y = x === z ? Math.PI / 4 : -Math.PI / 4;
        bracket.material = centralGuideMaterial;
      }
    }

    if (mission.cytoplasmEstablished) {
      const cytoplasm = CreateCylinder(
        'cytoplasm-fill',
        { height: 0.5, diameter: 18.5, tessellation: 24 },
        this.scene,
      );
      cytoplasm.parent = this.missionRoot;
      cytoplasm.position.y = 0.55;
      const cytoplasmMaterial = this.missionMaterial(
        'cytoplasm-material',
        Color3.FromHexString('#e4c96d'),
        0.46,
      );
      if (mission.functionEvidence.cytoplasm) {
        cytoplasmMaterial.emissiveColor = Color3.FromHexString('#6b5722');
      }
      cytoplasm.material = cytoplasmMaterial;
    }

    for (const placement of Object.values(mission.placements)) {
      if (!placement) continue;
      const position = new Vector3(placement.position.x, 1.5, placement.position.z);
      if (placement.id === 'nucleus') {
        const nucleus = CreateSphere('nucleus', { diameter: 3.4, segments: 16 }, this.scene);
        nucleus.parent = this.missionRoot;
        nucleus.position = position;
        nucleus.material = this.missionMaterial(
          'nucleus-material',
          Color3.FromHexString('#8955ae'),
        );
        const nuclearMembrane = CreateSphere(
          'nuclear-membrane',
          { diameter: 3.8, segments: 16 },
          this.scene,
        );
        nuclearMembrane.parent = this.missionRoot;
        nuclearMembrane.position = position;
        nuclearMembrane.material = this.missionMaterial(
          'nuclear-membrane-material',
          Color3.FromHexString('#cdb8df'),
          0.14,
        );
        for (const axis of ['x', 'y', 'z'] as const) {
          const membraneBand = CreateTorus(
            `nuclear-membrane-band-${axis}`,
            { diameter: 3.8, thickness: 0.07, tessellation: 20 },
            this.scene,
          );
          membraneBand.parent = this.missionRoot;
          membraneBand.position = position;
          if (axis === 'x') membraneBand.rotation.x = Math.PI / 2;
          if (axis === 'z') membraneBand.rotation.z = Math.PI / 2;
          membraneBand.material = this.missionMaterial(
            `nuclear-membrane-band-material-${axis}`,
            Color3.FromHexString('#d8c3e8'),
            0.76,
          );
        }
      } else if (placement.id === 'ribosomes') {
        for (let i = 0; i < 12; i += 1) {
          const ribosome = CreateSphere(
            `ribosome-${i}`,
            { diameter: 0.34, segments: 6 },
            this.scene,
          );
          ribosome.parent = this.missionRoot;
          ribosome.position = position.add(
            new Vector3((i % 4) * 0.5 - 0.75, Math.floor(i / 4) * 0.45, (i % 3) * 0.36 - 0.36),
          );
          ribosome.material = this.missionMaterial(
            `ribosome-material-${i}`,
            Color3.FromHexString('#f2eee6'),
          );
        }
      } else if (placement.id === 'mitochondria' || placement.id === 'chloroplasts') {
        const organelle = CreateCapsule(
          placement.id,
          { height: 2.8, radius: 0.75, tessellation: 10, subdivisions: 2 },
          this.scene,
        );
        organelle.parent = this.missionRoot;
        organelle.position = position;
        organelle.rotation.z = Math.PI / 2;
        organelle.material = this.missionMaterial(
          `${placement.id}-material`,
          placement.id === 'mitochondria'
            ? Color3.FromHexString('#df704f')
            : Color3.FromHexString('#4f9a4e'),
        );
        const bandCount = placement.id === 'mitochondria' ? 3 : 2;
        for (let index = 0; index < bandCount; index += 1) {
          const band = CreateTorus(
            `${placement.id}-band-${index}`,
            {
              diameter: placement.id === 'mitochondria' ? 1.25 : 1.42,
              thickness: placement.id === 'mitochondria' ? 0.08 : 0.13,
              tessellation: 14,
            },
            this.scene,
          );
          band.parent = this.missionRoot;
          band.position = position.add(new Vector3((index - (bandCount - 1) / 2) * 0.7, 0, 0));
          band.rotation.z = Math.PI / 2;
          band.material = this.missionMaterial(
            `${placement.id}-band-material-${index}`,
            placement.id === 'mitochondria'
              ? Color3.FromHexString('#6f2e27')
              : Color3.FromHexString('#b8e65f'),
          );
        }
      } else if (placement.id === 'centralVacuole') {
        const vacuole = CreateSphere(
          'central-vacuole',
          { diameter: 5.2, segments: 14 },
          this.scene,
        );
        vacuole.parent = this.missionRoot;
        vacuole.position = new Vector3(placement.position.x, 2.7, placement.position.z);
        const wilted = mission.droughtStarted && !mission.recoveryRestored;
        vacuole.scaling = new Vector3(wilted ? 0.72 : 1, wilted ? 0.55 : 1.08, wilted ? 0.72 : 1);
        vacuole.material = this.missionMaterial(
          'vacuole-material',
          wilted ? Color3.FromHexString('#5d7688') : Color3.FromHexString('#53b6cf'),
        );
        const waterLevelMaterial = this.missionMaterial(
          'vacuole-water-level-material',
          wilted ? Color3.FromHexString('#a6b3bd') : Color3.FromHexString('#d7fbff'),
          0.88,
        );
        const waterLevels = wilted ? [-0.55] : [-0.75, 0.15, 1.05];
        for (const [index, level] of waterLevels.entries()) {
          const waterLevel = CreateTorus(
            `vacuole-water-level-${index}`,
            { diameter: wilted ? 2.8 : 4.4, thickness: 0.08, tessellation: 20 },
            this.scene,
          );
          waterLevel.parent = this.missionRoot;
          waterLevel.position = vacuole.position.add(new Vector3(0, level, 0));
          waterLevel.material = waterLevelMaterial;
        }
      }
      if (mission.functionEvidence[placement.id]) {
        const colors = {
          nucleus: '#b684df',
          ribosomes: '#fff3cf',
          mitochondria: '#ff916b',
          chloroplasts: '#7ddb65',
          centralVacuole: '#63d7ef',
        } as const;
        const signal = CreateTorus(
          `function-signal-${placement.id}`,
          { diameter: placement.id === 'centralVacuole' ? 7.5 : 3.5, thickness: 0.12 },
          this.scene,
        );
        signal.parent = this.missionRoot;
        signal.position = position.add(new Vector3(0, 1.15, 0));
        signal.rotation.x = Math.PI / 2;
        const signalMaterial = this.missionMaterial(
          `function-signal-material-${placement.id}`,
          Color3.FromHexString(colors[placement.id]),
          0.9,
        );
        signalMaterial.emissiveColor = Color3.FromHexString(colors[placement.id]);
        signal.material = signalMaterial;
      }
    }

    for (const placement of Object.values(mission.placements)) {
      if (!placement || placement.id !== this.preferredStructure) continue;
      const buffer =
        placement.id === 'centralVacuole'
          ? 7
          : placement.id === 'nucleus'
            ? 4
            : placement.id === 'ribosomes'
              ? 3.2
              : 4;
      const offset = new Vector3(
        this.camera.position.x - placement.position.x,
        0,
        this.camera.position.z - placement.position.z,
      );
      const distance = offset.length();
      if (distance < buffer) {
        const towardCenter = new Vector3(-placement.position.x, 0, -placement.position.z);
        const centerDistance = towardCenter.length();
        const direction =
          placement.id !== 'centralVacuole' && centerDistance > 0.05
            ? towardCenter.scale(1 / centerDistance)
            : distance < 0.05
              ? new Vector3(1, 0, 0)
              : offset.scale(1 / distance);
        this.camera.position.x = placement.position.x + direction.x * buffer;
        this.camera.position.z = placement.position.z + direction.z * buffer;
      }
      if (distance <= buffer + 0.35) {
        this.camera.setTarget(
          new Vector3(
            placement.position.x,
            placement.id === 'centralVacuole' ? 2.7 : 1.5,
            placement.position.z,
          ),
        );
      }
    }

    if (mission.placements.centralVacuole) {
      const wilted = mission.droughtStarted && !mission.recoveryRestored;
      const stem = CreateCylinder(
        'plant-status-stem',
        { height: 5.2, diameter: 0.35, tessellation: 8 },
        this.scene,
      );
      stem.parent = this.missionRoot;
      stem.position = new Vector3(0, 4.2, 10.8);
      stem.material = this.missionMaterial(
        'plant-stem-material',
        wilted ? Color3.FromHexString('#8a7048') : Color3.FromHexString('#4c9954'),
      );
      for (const side of [-1, 1]) {
        const leaf = CreateCapsule(
          `plant-status-leaf-${side}`,
          { height: 2.7, radius: 0.6, tessellation: 10, subdivisions: 2 },
          this.scene,
        );
        leaf.parent = this.missionRoot;
        leaf.position = new Vector3(side * 1.1, wilted ? 4.8 : 6.2, 10.8);
        leaf.rotation.z = side * (wilted ? 1.05 : 0.62);
        leaf.material = this.missionMaterial(
          `plant-leaf-material-${side}`,
          wilted ? Color3.FromHexString('#9b7446') : Color3.FromHexString('#61b95d'),
        );
      }
      const statusText = wilted
        ? 'EXTERNAL WATER LIMITED  |  WILTING'
        : mission.recoveryRestored
          ? 'WATER RESTORED  |  FIRM AGAIN'
          : 'WATER STORED  |  FIRM';
      this.missionBillboard(
        'plant-status-label',
        statusText,
        new Vector3(0, 8.2, 10.8),
        wilted ? '#ffbd72' : '#b8e65f',
      );
    }

    if (mission.droughtStarted) {
      const alertMaterial = this.missionMaterial(
        'homeostasis-alert-material',
        mission.recoveryRestored
          ? Color3.FromHexString('#62d18a')
          : Color3.FromHexString('#e09b56'),
        0.85,
      );
      if (mission.recoveryRestored) {
        for (const [index, diameter] of [19.6, 20.3].entries()) {
          const alert = CreateTorus(
            `homeostasis-alert-${index}`,
            { diameter, thickness: 0.11, tessellation: 32 },
            this.scene,
          );
          alert.parent = this.missionRoot;
          alert.position.y = 0.5;
          alert.material = alertMaterial;
        }
      } else {
        for (let index = 0; index < 12; index += 1) {
          const angle = (Math.PI * 2 * index) / 12;
          const alert = CreateBox(
            `homeostasis-alert-segment-${index}`,
            { width: 2.6, height: 0.08, depth: 0.22 },
            this.scene,
          );
          alert.parent = this.missionRoot;
          alert.position = new Vector3(Math.sin(angle) * 10, 0.5, Math.cos(angle) * 10);
          alert.rotation.y = angle;
          alert.material = alertMaterial;
        }
      }
    }
  }

  getPlacementPosition(): Point3 {
    return {
      x: Math.round(this.camera.position.x),
      y: 1,
      z: Math.round(this.camera.position.z),
    };
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.clearInput();
  }

  setJoystick(x: number, z: number): void {
    this.joystick = { x, z };
  }

  setSelectedItem(item: StructureId | null): void {
    this.selectedItem = item;
    this.preview?.dispose();
    this.previewValidMarker?.dispose();
    this.previewBlockedMarkers.forEach((marker) => marker.dispose());
    this.previewMaterial?.dispose();
    this.preview = null;
    this.previewValidMarker = null;
    this.previewBlockedMarkers = [];
    this.previewMaterial = null;
    this.lastPlacementPreviewKey = '';
    this.callbacks.onPlacementPreview(null);
    if (!item || item === 'cytoplasm') {
      if (this.currentMission) this.syncMission(this.currentMission);
      return;
    }
    this.preview = CreateBox(
      'placement-footprint',
      {
        width: item === 'centralVacuole' ? 3.5 : 1.7,
        height: 0.12,
        depth: item === 'centralVacuole' ? 3.5 : 1.7,
      },
      this.scene,
    );
    this.previewMaterial = standardMaterial(
      this.scene,
      'placement-footprint-material',
      Color3.FromHexString('#f06f5f'),
      0.6,
    );
    this.preview.material = this.previewMaterial;
    this.previewValidMarker = CreateTorus(
      'placement-valid-marker',
      {
        diameter: item === 'centralVacuole' ? 4.1 : 2.25,
        thickness: 0.14,
        tessellation: 20,
      },
      this.scene,
    );
    this.previewValidMarker.material = this.previewMaterial;
    for (const rotation of [Math.PI / 4, -Math.PI / 4]) {
      const marker = CreateBox(
        `placement-blocked-marker-${rotation}`,
        {
          width: item === 'centralVacuole' ? 4.2 : 2.3,
          height: 0.15,
          depth: 0.24,
        },
        this.scene,
      );
      marker.rotation.y = rotation;
      marker.material = this.previewMaterial;
      this.previewBlockedMarkers.push(marker);
    }
    if (this.currentMission) this.syncMission(this.currentMission);
  }

  clearInput(): void {
    this.keys.clear();
    this.joystick = { x: 0, z: 0 };
    this.pointerId = null;
  }

  recenter(): void {
    this.camera.position = new Vector3(-18, 2.4, 10);
    this.camera.rotation = new Vector3(0, 2.16, 0);
    this.clearInput();
  }

  setQuality(mode: QualityMode): void {
    const low = mode === 'low' || (mode === 'auto' && window.devicePixelRatio > 1.5);
    this.engine.setHardwareScalingLevel(
      low ? Math.max(1.4, window.devicePixelRatio) : Math.max(1, window.devicePixelRatio / 1.5),
    );
  }

  resize(): void {
    this.engine.resize();
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.clearInput();
    this.callbacks.onContextLost();
  };

  dispose(canvas: HTMLCanvasElement): void {
    this.disposed = true;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerRelease);
    canvas.removeEventListener('pointercancel', this.handlePointerRelease);
    canvas.removeEventListener('lostpointercapture', this.handlePointerRelease);
    this.clearInput();
    this.scene.dispose();
    this.engine.dispose();
  }
}
