import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

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
const developmentToolSentinels = [
  'Advance test stage',
  'Set active timer to limit',
  'advanceIntegratedMissionForTesting',
];
for (const name of builtAssets) {
  if (/integratedMissionTestTools/i.test(name)) {
    throw new Error(`DEVELOPMENT_TOOL_CHUNK_IN_PRODUCTION:${name}`);
  }
  if (!name.endsWith('.js')) continue;
  const source = await readFile(path.join(distRoot, 'assets', name), 'utf8');
  for (const sentinel of developmentToolSentinels) {
    if (source.includes(sentinel)) {
      throw new Error(`DEVELOPMENT_TOOL_CODE_IN_PRODUCTION:${name}:${sentinel}`);
    }
  }
}
const missionChunks = builtAssets.filter((name) => /^VoxelMissionApp-.*\.js$/.test(name));
if (missionChunks.length !== 1) {
  throw new Error(`EXPECTED_ONE_LAZY_MISSION_CHUNK:${missionChunks.length}`);
}
if (initialAssets.some((asset) => asset.endsWith(missionChunks[0]))) {
  throw new Error(`MISSION_CHUNK_IS_INITIAL:${missionChunks[0]}`);
}

const STATIC_IMPORT_BUDGET = {
  rawBytes: 1_300_000,
  gzipBytes: 335_000,
};
const initialAssetNames = new Set(initialAssets.map((asset) => path.basename(asset)));
const staticMissionFiles = new Set();
const pendingStaticImports = [missionChunks[0]];

while (pendingStaticImports.length > 0) {
  const file = pendingStaticImports.pop();
  if (!file || staticMissionFiles.has(file) || initialAssetNames.has(file)) continue;
  staticMissionFiles.add(file);
  const source = await readFile(path.join(distRoot, 'assets', file), 'utf8');
  const imports = [
    ...source.matchAll(/\bfrom\s*["']\.\/([^"']+\.js)["']/g),
    ...source.matchAll(/(?:^|[;\n])import\s*["']\.\/([^"']+\.js)["']/g),
  ].map((match) => match[1]);
  pendingStaticImports.push(...imports);
}

let staticMissionRawBytes = 0;
let staticMissionGzipBytes = 0;
for (const file of staticMissionFiles) {
  const contents = await readFile(path.join(distRoot, 'assets', file));
  staticMissionRawBytes += contents.byteLength;
  staticMissionGzipBytes += gzipSync(contents).byteLength;
}
if (staticMissionRawBytes > STATIC_IMPORT_BUDGET.rawBytes) {
  throw new Error(
    `MISSION_STATIC_RAW_BUDGET_EXCEEDED:${staticMissionRawBytes}:${STATIC_IMPORT_BUDGET.rawBytes}`,
  );
}
if (staticMissionGzipBytes > STATIC_IMPORT_BUDGET.gzipBytes) {
  throw new Error(
    `MISSION_STATIC_GZIP_BUDGET_EXCEEDED:${staticMissionGzipBytes}:${STATIC_IMPORT_BUDGET.gzipBytes}`,
  );
}

process.stdout.write(
  `${JSON.stringify({
    initialAssets,
    lazyMissionChunk: missionChunks[0],
    staticMissionJsDependencyClosure: {
      files: staticMissionFiles.size,
      rawBytes: staticMissionRawBytes,
      gzipBytes: staticMissionGzipBytes,
      budget: STATIC_IMPORT_BUDGET,
    },
    status: 'passed',
  })}\n`,
);
