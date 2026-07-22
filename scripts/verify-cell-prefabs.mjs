import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const modelRoot = path.join(process.cwd(), 'public', 'models');
const expectedIds = ['centralVacuole', 'chloroplasts', 'mitochondria', 'nucleus', 'ribosomes'];

const files = (await readdir(modelRoot)).sort();
const expectedFiles = expectedIds.map((id) => `${id}.gltf`).sort();
if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
  throw new Error(
    `Expected exactly ${expectedFiles.join(', ')} in public/models; found ${files.join(', ')}`,
  );
}

for (const id of expectedIds) {
  const file = path.join(modelRoot, `${id}.gltf`);
  const model = JSON.parse(await readFile(file, 'utf8'));
  if (model.asset?.version !== '2.0') throw new Error(`${id}: expected glTF 2.0`);
  if (model.extras?.originalAsset !== true) throw new Error(`${id}: original asset marker missing`);
  if (model.extras?.structureId !== id)
    throw new Error(`${id}: structure ID does not match filename`);
  if (!Array.isArray(model.scenes) || !Array.isArray(model.nodes) || !Array.isArray(model.meshes)) {
    throw new Error(`${id}: incomplete scene, node, or mesh data`);
  }
  const meshReferences = model.nodes
    .filter((node) => Number.isInteger(node.mesh))
    .map((node) => node.mesh);
  if (new Set(meshReferences).size !== meshReferences.length) {
    throw new Error(`${id}: voxel parts must not require runtime mesh instancing`);
  }
  for (const buffer of model.buffers ?? []) {
    if (typeof buffer.uri !== 'string' || !buffer.uri.startsWith('data:')) {
      throw new Error(`${id}: model buffers must be embedded local data URIs`);
    }
  }
  const serialized = JSON.stringify(model);
  if (serialized.includes('http://') || serialized.includes('https://')) {
    throw new Error(`${id}: external asset URL is not allowed`);
  }
}

process.stdout.write(`Verified ${expectedIds.length} original local glTF prefabs.\n`);
