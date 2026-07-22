import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? process.env.PHASE4_AUDIT_OUTPUT_DIR ?? '');
if (!process.argv[2] && !process.env.PHASE4_AUDIT_OUTPUT_DIR) {
  throw new Error('PHASE4_AUDIT_OUTPUT_DIR_REQUIRED');
}
const expectedSha = process.argv[3] ?? process.env.PHASE4_AUDIT_EXPECTED_SHA ?? '';
if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error('PHASE4_AUDIT_EXPECTED_SHA_REQUIRED');
}

async function digestDirectory(directory, ignoredFiles = new Set()) {
  const files = [];
  async function visit(current, relative = '') {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
      if (ignoredFiles.has(relativePath)) continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else if (entry.isFile()) files.push({ absolutePath, relativePath });
    }
  }
  await visit(directory);
  const digest = createHash('sha256');
  for (const file of files) {
    digest.update(file.relativePath);
    digest.update('\0');
    digest.update(await readFile(file.absolutePath));
    digest.update('\0');
  }
  return digest.digest('hex');
}

const expected = {
  'chromium-standard': [
    '01-cell-wall-function.png',
    '02-cell-membrane-function.png',
    '03-cytoplasm-function.png',
    '04-nucleus-function.png',
    '05-ribosomes-function.png',
    '06-mitochondria-function.png',
    '07-chloroplasts-function.png',
    '08-central-vacuole-function.png',
  ],
  'webkit-low': [
    '01-tutorial-settings.png',
    '02-mission-opening.png',
    '03-grade-modal.png',
    '04-overview-not-established.png',
    '05-orientation-interruption.png',
    '06-landscape-pause.png',
    '07-overview-hydrated.png',
    '08-overview-drought.png',
    '09-overview-restored.png',
    '10-results.png',
  ],
};

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('PHASE4_EVIDENCE_PNG_INVALID');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function inspectSensitiveData(value, trail = 'manifest') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSensitiveData(entry, `${trail}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (
        /first.?name|last.?initial|class.?period|attempt.?id|session.?id|identity|student|token|private.?url|payload|receipt|email/i.test(
          key,
        )
      ) {
        throw new Error(`PHASE4_EVIDENCE_SENSITIVE_KEY:${trail}.${key}`);
      }
      inspectSensitiveData(entry, `${trail}.${key}`);
    }
    return;
  }
  if (typeof value !== 'string') return;
  if (/https?:\/\//i.test(value) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) {
    throw new Error(`PHASE4_EVIDENCE_SENSITIVE_STRING:${trail}`);
  }
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(value)) {
    throw new Error(`PHASE4_EVIDENCE_TRANSIENT_ID:${trail}`);
  }
}

let totalImages = 0;
let testedAppSha = null;
let evidenceHarnessSha = null;
let treeSha = null;
let scopeDigest = null;
let distDigest = null;
const profiles = {};

for (const [profile, expectedFiles] of Object.entries(expected)) {
  const profileRoot = path.join(root, profile);
  const directoryEntries = (await readdir(profileRoot)).sort();
  const expectedEntries = [...expectedFiles, 'run.json'].sort();
  if (JSON.stringify(directoryEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`PHASE4_EVIDENCE_DIRECTORY_CONTENTS:${profile}`);
  }
  const manifest = JSON.parse(await readFile(path.join(profileRoot, 'run.json'), 'utf8'));
  inspectSensitiveData(manifest);
  if (
    manifest.schemaVersion !== 2 ||
    manifest.auditKind !== 'phase4-built-performance-accessibility' ||
    manifest.countedRun !== null ||
    manifest.rolloutRecounted !== false ||
    manifest.physicalDeviceEvidence !== false ||
    manifest.target !== 'local-built' ||
    manifest.evidenceStatus !== 'accepted'
  ) {
    throw new Error(`PHASE4_EVIDENCE_HEADER_INVALID:${profile}`);
  }
  if (
    !/^[0-9a-f]{40}$/.test(manifest.testedAppSha) ||
    !/^[0-9a-f]{40}$/.test(manifest.evidenceHarnessSha) ||
    manifest.testedAppSha !== expectedSha ||
    manifest.evidenceHarnessSha !== expectedSha
  ) {
    throw new Error(`PHASE4_EVIDENCE_SHA_INVALID:${profile}`);
  }
  testedAppSha ??= manifest.testedAppSha;
  evidenceHarnessSha ??= manifest.evidenceHarnessSha;
  if (
    manifest.testedAppSha !== testedAppSha ||
    manifest.evidenceHarnessSha !== evidenceHarnessSha
  ) {
    throw new Error('PHASE4_EVIDENCE_SHA_MISMATCH');
  }
  if (
    manifest.buildProvenance?.schemaVersion !== 1 ||
    manifest.buildProvenance?.status !== 'accepted' ||
    manifest.buildProvenance?.scopeClean !== true ||
    manifest.buildProvenance?.testedAppSha !== manifest.testedAppSha ||
    manifest.buildProvenance?.evidenceHarnessSha !== manifest.evidenceHarnessSha ||
    manifest.buildProvenance?.headSha !== manifest.testedAppSha ||
    !/^[0-9a-f]{40}$/.test(manifest.buildProvenance?.treeSha ?? '') ||
    !/^[0-9a-f]{64}$/.test(manifest.buildProvenance?.scopeDigest ?? '') ||
    !/^[0-9a-f]{64}$/.test(manifest.buildProvenance?.distDigest ?? '')
  ) {
    throw new Error(`PHASE4_EVIDENCE_BUILD_PROVENANCE:${profile}`);
  }
  treeSha ??= manifest.buildProvenance.treeSha;
  scopeDigest ??= manifest.buildProvenance.scopeDigest;
  distDigest ??= manifest.buildProvenance.distDigest;
  if (
    manifest.buildProvenance.treeSha !== treeSha ||
    manifest.buildProvenance.scopeDigest !== scopeDigest ||
    manifest.buildProvenance.distDigest !== distDigest
  ) {
    throw new Error('PHASE4_EVIDENCE_BUILD_PROVENANCE_MISMATCH');
  }
  const startedAt = Date.parse(manifest.startedAtUtc);
  const endedAt = Date.parse(manifest.endedAtUtc);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    throw new Error(`PHASE4_EVIDENCE_TIME_RANGE:${profile}`);
  }
  if ((manifest.diagnostics?.frozenOverviewSurfacePngBytes ?? 0) <= 75_000) {
    throw new Error(`PHASE4_EVIDENCE_FROZEN_SURFACE:${profile}`);
  }
  if (
    !manifest.semanticGates ||
    Object.values(manifest.semanticGates).length === 0 ||
    Object.values(manifest.semanticGates).some((value) => value !== true)
  ) {
    throw new Error(`PHASE4_EVIDENCE_GATE_FAILED:${profile}`);
  }
  if (
    !manifest.errors ||
    manifest.errors.page?.length !== 0 ||
    manifest.errors.console?.length !== 0 ||
    manifest.errors.webglContextLosses !== 0
  ) {
    throw new Error(`PHASE4_EVIDENCE_ERRORS_PRESENT:${profile}`);
  }
  const actualFiles = manifest.screenshots?.map((image) => image.file) ?? [];
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`PHASE4_EVIDENCE_SCREENSHOT_ORDER:${profile}`);
  }
  for (const image of manifest.screenshots) {
    if (!/^[0-9a-f]{64}$/.test(image.sha256)) {
      throw new Error(`PHASE4_EVIDENCE_HASH_INVALID:${profile}:${image.file}`);
    }
    const buffer = await readFile(path.join(profileRoot, image.file));
    if (image.file.includes('overview') && buffer.length < 100_000) {
      throw new Error(`PHASE4_EVIDENCE_OVERVIEW_SURFACE_BLANK:${profile}:${image.file}`);
    }
    const actualHash = createHash('sha256').update(buffer).digest('hex');
    if (actualHash !== image.sha256) {
      throw new Error(`PHASE4_EVIDENCE_HASH_MISMATCH:${profile}:${image.file}`);
    }
    const dimensions = pngDimensions(buffer);
    const dimensionsValid =
      profile === 'chromium-standard'
        ? dimensions.width === 1024 && dimensions.height === 768
        : image.file === '05-orientation-interruption.png'
          ? dimensions.width === 1360 && dimensions.height === 2048
          : image.file === '01-tutorial-settings.png'
            ? dimensions.width === 2048 && dimensions.height > 1360
            : dimensions.width === 2048 && dimensions.height === 1360;
    if (!dimensionsValid) {
      throw new Error(
        `PHASE4_EVIDENCE_DIMENSIONS:${profile}:${image.file}:${dimensions.width}x${dimensions.height}`,
      );
    }
    totalImages += 1;
  }
  profiles[profile] = {
    images: manifest.screenshots.length,
    startToActionableMs: manifest.timings.startToActionableMs,
    quality: manifest.profile.quality,
  };
}

if (totalImages !== 18) throw new Error(`PHASE4_EVIDENCE_IMAGE_TOTAL:${totalImages}`);
const currentDistDigest = await digestDirectory(
  path.join(process.cwd(), 'dist'),
  new Set(['phase4-audit-provenance.json']),
);
if (currentDistDigest !== distDigest) {
  throw new Error('PHASE4_EVIDENCE_DIST_DIGEST_MISMATCH');
}

process.stdout.write(
  `${JSON.stringify({
    auditKind: 'phase4-built-performance-accessibility',
    testedAppSha,
    evidenceHarnessSha,
    treeSha,
    scopeDigest,
    distDigest,
    profiles,
    totalImages,
    physicalDeviceEvidence: false,
    status: 'passed',
  })}\n`,
);
