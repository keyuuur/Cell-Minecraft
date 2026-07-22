import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, 'dist');
const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');
const initialAssets = [
  ...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.js)"[^>]*>/g),
].map((match) => match[1]);

if (initialAssets.length === 0) throw new Error('PRODUCTION_ENTRY_ASSET_NOT_FOUND');
const forbiddenName = /babylon|voxelmission|loader|\.gl(?:b|tf)$/i;
for (const asset of initialAssets) {
  if (forbiddenName.test(asset)) throw new Error(`MISSION_ASSET_PRELOADED:${asset}`);
  const localPath = path.join(distRoot, asset.replace(/^\//, ''));
  const source = await readFile(localPath, 'utf8');
  for (const sentinel of ['voxel-mission-camera', 'mission-held-tool', 'webglcontextlost']) {
    if (source.includes(sentinel)) throw new Error(`MISSION_CODE_IN_PRODUCTION_ENTRY:${sentinel}`);
  }
}

const builtAssets = await readdir(path.join(distRoot, 'assets'));
const missionChunks = builtAssets.filter((name) => /^VoxelMissionApp-.*\.js$/.test(name));
if (missionChunks.length !== 1) {
  throw new Error(`EXPECTED_ONE_LAZY_MISSION_CHUNK:${missionChunks.length}`);
}
if (initialAssets.some((asset) => asset.endsWith(missionChunks[0]))) {
  throw new Error(`MISSION_CHUNK_IS_INITIAL:${missionChunks[0]}`);
}

process.stdout.write(
  `${JSON.stringify({ initialAssets, lazyMissionChunk: missionChunks[0], status: 'passed' })}\n`,
);
