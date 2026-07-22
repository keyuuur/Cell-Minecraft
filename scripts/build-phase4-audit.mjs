import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const AUDIT_SCOPE = [
  'src',
  'public',
  'index.html',
  'e2e/helpers/voxelMissionControls.ts',
  'e2e/phase4-built-performance-a11y.spec.ts',
  'playwright.phase4-audit.config.ts',
  'scripts/build-phase4-audit.mjs',
  'scripts/verify-phase4-audit-evidence.mjs',
  'scripts/verify-production-lazy-boundary.mjs',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
];

async function digestDirectory(root, ignoredFiles = new Set()) {
  const files = [];
  async function visit(directory, relative = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
      if (ignoredFiles.has(relativePath)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else if (entry.isFile()) files.push({ absolutePath, relativePath });
    }
  }
  await visit(root);
  const digest = createHash('sha256');
  for (const file of files) {
    digest.update(file.relativePath);
    digest.update('\0');
    digest.update(await readFile(file.absolutePath));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(`PHASE4_BUILD_COMMAND_FAILED:${command}:${args.join(' ')}`);
  }
  return (result.stdout ?? '').trim();
}

const status = process.env.PHASE4_AUDIT_STATUS === 'accepted' ? 'accepted' : 'calibration';
const headSha = run('git', ['rev-parse', 'HEAD']);
const treeSha = run('git', ['rev-parse', 'HEAD^{tree}']);
const scopeStatus = run('git', [
  'status',
  '--porcelain',
  '--untracked-files=all',
  '--',
  ...AUDIT_SCOPE,
]);
const scopeClean = scopeStatus === '';
const scopeListing = run('git', ['ls-tree', '-r', 'HEAD', '--', ...AUDIT_SCOPE]);
const scopeDigest = createHash('sha256').update(scopeListing).digest('hex');
const testedAppSha = process.env.PHASE4_AUDIT_APP_SHA ?? headSha;
const evidenceHarnessSha = process.env.PHASE4_AUDIT_HARNESS_SHA ?? headSha;

if (status === 'accepted') {
  if (testedAppSha !== headSha || evidenceHarnessSha !== headSha) {
    throw new Error('PHASE4_BUILD_SHA_MUST_MATCH_HEAD');
  }
  if (!scopeClean) throw new Error('PHASE4_BUILD_SCOPE_NOT_CLEAN');
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('PHASE4_BUILD_NPM_CLI_MISSING');
run(process.execPath, [npmCli, 'run', 'build'], { stdio: 'inherit' });
const distDigest = await digestDirectory(
  path.join(process.cwd(), 'dist'),
  new Set(['phase4-audit-provenance.json']),
);

await writeFile(
  path.join(process.cwd(), 'dist', 'phase4-audit-provenance.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      status,
      testedAppSha,
      evidenceHarnessSha,
      headSha,
      treeSha,
      scopeDigest,
      distDigest,
      scopeClean,
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `${JSON.stringify({ status, headSha, treeSha, scopeDigest, distDigest, scopeClean, output: 'dist' })}\n`,
);
