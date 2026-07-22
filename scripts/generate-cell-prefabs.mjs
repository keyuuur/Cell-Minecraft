import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputRoot = path.join(process.cwd(), 'public', 'models');

const positions = [
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5,
  -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
  -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
  -0.5,
];
const normals = [
  0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0,
  1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0,
  0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
];
const indices = [
  0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16,
  18, 19, 20, 21, 22, 20, 22, 23,
];

const materials = {
  purple: [0.53, 0.33, 0.68, 1],
  membrane: [0.84, 0.76, 0.91, 0.28],
  white: [0.93, 0.92, 0.88, 1],
  cream: [1, 0.92, 0.57, 1],
  orange: [0.87, 0.42, 0.29, 1],
  darkOrange: [0.43, 0.18, 0.15, 1],
  green: [0.31, 0.6, 0.3, 1],
  lime: [0.77, 0.93, 0.4, 1],
  blue: [0.33, 0.71, 0.81, 0.58],
};

const prefabs = {
  nucleus: [
    ['NucleusCore', 'purple', [0, 1.85, 0], [1.62, 2.4, 1.62]],
    ['NuclearMembraneVisual', 'membrane', [0, 1.85, 0], [1.88, 2.72, 1.88]],
  ],
  ribosomes: Array.from({ length: 12 }, (_, index) => [
    `Ribosome_${index}`,
    'white',
    [(index % 4) * 0.42 - 0.63, 1.15 + Math.floor(index / 4) * 0.38, (index % 3) * 0.32 - 0.32],
    [0.3, 0.3, 0.3],
  ]),
  mitochondria: [
    ['MitoCenter', 'orange', [0, 1.45, 0], [1.22, 1.02, 1.15]],
    ['MitoLeftLobe', 'orange', [-0.7, 1.35, 0.08], [0.66, 0.86, 1.02]],
    ['MitoRightLobe', 'orange', [0.7, 1.52, -0.08], [0.7, 1.15, 0.94]],
    ...Array.from({ length: 4 }, (_, index) => [
      `Crista_${index}`,
      'darkOrange',
      [(index - 1.5) * 0.42, 1.44 + (index % 2) * 0.18, 0],
      [0.4, 0.14, 1.2],
    ]),
  ],
  chloroplasts: [
    ['ChloroplastLowerLens', 'green', [0, 1.2, 0], [1.75, 0.4, 1.2]],
    ['ChloroplastUpperLens', 'green', [0, 1.58, 0], [1.45, 0.34, 1.45]],
    ...Array.from({ length: 9 }, (_, index) => [
      `Granum_${index}`,
      'lime',
      [((index % 3) - 1) * 0.5, 1.74 + Math.floor(index / 3) * 0.13, 0],
      [0.32, 0.09, 0.46],
    ]),
  ],
  centralVacuole: [['LargeCentralVacuole', 'blue', [0, 2.32, 0], [2.55, 3.5, 2.55]]],
};

function aligned(value) {
  return (value + 3) & ~3;
}

function createGeometryBuffer() {
  const positionBytes = positions.length * 4;
  const normalOffset = aligned(positionBytes);
  const normalBytes = normals.length * 4;
  const indexOffset = aligned(normalOffset + normalBytes);
  const indexBytes = indices.length * 2;
  const buffer = Buffer.alloc(aligned(indexOffset + indexBytes));
  positions.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  normals.forEach((value, index) => buffer.writeFloatLE(value, normalOffset + index * 4));
  indices.forEach((value, index) => buffer.writeUInt16LE(value, indexOffset + index * 2));
  return { buffer, positionBytes, normalOffset, normalBytes, indexOffset, indexBytes };
}

function gltfFor(id, parts) {
  const geometry = createGeometryBuffer();
  const usedMaterials = [...new Set(parts.map((part) => part[1]))];
  const materialIndex = new Map(usedMaterials.map((name, index) => [name, index]));
  const meshes = parts.map(([name, material]) => ({
    name: `VoxelPart_${name}`,
    primitives: [
      {
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: materialIndex.get(material),
      },
    ],
  }));
  const nodes = [
    { name: `CellPrefab_${id}`, children: parts.map((_, index) => index + 1) },
    ...parts.map(([name, , translation, scale], index) => ({
      name,
      mesh: index,
      translation,
      scale,
    })),
  ];
  return {
    asset: { version: '2.0', generator: 'Build a Living Cell original voxel prefab generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes,
    materials: usedMaterials.map((name) => {
      const color = materials[name];
      return {
        name,
        pbrMetallicRoughness: {
          baseColorFactor: color,
          metallicFactor: 0,
          roughnessFactor: 0.92,
        },
        ...(color[3] < 1 ? { alphaMode: 'BLEND', doubleSided: true } : {}),
      };
    }),
    buffers: [
      {
        byteLength: geometry.buffer.length,
        uri: `data:application/octet-stream;base64,${geometry.buffer.toString('base64')}`,
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: geometry.positionBytes, target: 34962 },
      {
        buffer: 0,
        byteOffset: geometry.normalOffset,
        byteLength: geometry.normalBytes,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: geometry.indexOffset,
        byteLength: geometry.indexBytes,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    extras: {
      classroomScope: 'Unit 1 plant-cell model',
      originalAsset: true,
      structureId: id,
    },
  };
}

await mkdir(outputRoot, { recursive: true });
for (const [id, parts] of Object.entries(prefabs)) {
  const contents = `${JSON.stringify(gltfFor(id, parts))}\n`;
  await writeFile(path.join(outputRoot, `${id}.gltf`), contents, 'utf8');
}

process.stdout.write(`Generated ${Object.keys(prefabs).length} original local voxel prefabs.\n`);
