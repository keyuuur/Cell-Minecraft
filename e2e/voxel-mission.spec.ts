import { expect, test, type Locator, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const evidenceRoot = process.env.VOXEL_MISSION_EVIDENCE_DIR;
const testedAppSha = process.env.VOXEL_MISSION_TESTED_APP_SHA;
const evidenceHarnessSha = process.env.VOXEL_MISSION_EVIDENCE_HARNESS_SHA;
const EXPECTED_EVIDENCE_FILES = [
  '01-empty-chamber-wall-objective.png',
  '02-wall-stack-collected.png',
  '03-invalid-overlap-conserves-module.png',
  '04-nested-wall-and-membrane.png',
  '05-removed-membrane-and-recovery.png',
  '06-full-height-non-solid-cytoplasm.png',
  '07-nucleus-and-ribosomes-evidence.png',
  '08-mitochondria-and-chloroplasts-evidence.png',
  '09-hydrated-vacuole-and-80-checkpoint.png',
  '10-overview-all-eight-structures.png',
  '11-vacuole-removed-with-reachable-drop.png',
  '12-vacuole-replaced-before-reinspection.png',
  '13-vacuole-reinspected-score-restored.png',
] as const;
const TESTED_APP_PATHS = [
  'src',
  'index.html',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
] as const;
const EVIDENCE_HARNESS_PATHS = ['e2e/voxel-mission.spec.ts', 'playwright.config.ts'] as const;
const EVIDENCE_SCOPE_PATHS = [...TESTED_APP_PATHS, ...EVIDENCE_HARNESS_PATHS] as const;

function requireGitSuccess(args: string[], description: string): void {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Evidence provenance failed: ${description}.`);
  }
}

function requireEvidenceScopeClean(): void {
  const result = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', ...EVIDENCE_SCOPE_PATHS],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.status !== 0 || result.stdout.trim() !== '') {
    throw new Error('Evidence provenance failed: served app or harness scope is not clean.');
  }
}

if (evidenceRoot) {
  if (
    !/^[0-9a-f]{40}$/.test(testedAppSha ?? '') ||
    !/^[0-9a-f]{40}$/.test(evidenceHarnessSha ?? '')
  ) {
    throw new Error(
      'VOXEL_MISSION_TESTED_APP_SHA and VOXEL_MISSION_EVIDENCE_HARNESS_SHA must be full Git SHAs when evidence capture is enabled.',
    );
  }
  requireGitSuccess(
    ['cat-file', '-e', `${testedAppSha}^{commit}`],
    'tested app SHA is not a commit',
  );
  requireGitSuccess(
    ['cat-file', '-e', `${evidenceHarnessSha}^{commit}`],
    'evidence harness SHA is not a commit',
  );
  requireGitSuccess(
    ['merge-base', '--is-ancestor', evidenceHarnessSha!, testedAppSha!],
    'evidence harness is not an ancestor of the tested app',
  );
  requireGitSuccess(
    ['diff', '--quiet', evidenceHarnessSha!, '--', ...EVIDENCE_HARNESS_PATHS],
    'working evidence harness differs from its declared commit',
  );
  requireGitSuccess(
    ['diff', '--quiet', testedAppSha!, '--', ...TESTED_APP_PATHS],
    'served Phase 4.5 source differs from its declared commit',
  );
  requireEvidenceScopeClean();
}

interface EvidenceImage {
  file: string;
  sha256: string;
}

function horizontalDistance(left: string | null, right: string | null): number {
  const [leftX, , leftZ] = (left ?? '').split(',').map(Number);
  const [rightX, , rightZ] = (right ?? '').split(',').map(Number);
  if (![leftX, leftZ, rightX, rightZ].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return Math.hypot(leftX - rightX, leftZ - rightZ);
}

async function capture(page: Page, images: EvidenceImage[], file: string): Promise<void> {
  if (!evidenceRoot) return;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.waitForTimeout(120);
  await mkdir(evidenceRoot, { recursive: true });
  const filePath = path.join(evidenceRoot, file);
  const buffer = await page.screenshot({ path: filePath });
  images.push({ file, sha256: createHash('sha256').update(buffer).digest('hex') });
}

async function holdJoystick(
  page: Page,
  direction: 'forward' | 'backward' | 'left' | 'right',
  milliseconds = 220,
): Promise<void> {
  const joystick = page.getByRole('application', { name: /Movement joystick/ });
  const box = await joystick.boundingBox();
  if (!box) throw new Error('Movement joystick was not visible.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const forward = direction === 'forward' || direction === 'backward';
  const destination = {
    x: forward ? center.x : box.x + box.width * (direction === 'left' ? 0.12 : 0.88),
    y: forward ? box.y + box.height * (direction === 'forward' ? 0.12 : 0.88) : center.y,
  };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 4 });
  await page.waitForTimeout(milliseconds);
  await page.mouse.up();
  await page.waitForTimeout(90);
}

async function approachUntil(
  page: Page,
  mission: Locator,
  recenter: Locator,
  condition: () => Promise<boolean>,
  maximumPulses = 40,
  detour: 'left' | 'right' = 'right',
): Promise<void> {
  const navigationTrail: string[] = [];
  const recordNavigation = async (label: string): Promise<void> => {
    navigationTrail.push(
      `${label}:${await mission.getAttribute('data-mission-player-position')}:${await mission.getAttribute(
        'data-mission-target-cell',
      )}:${await mission.getAttribute('data-mission-target-face')}:${await mission.getAttribute(
        'data-mission-action-enabled',
      )}`,
    );
    if (navigationTrail.length > 12) navigationTrail.shift();
  };
  const distanceToRecenter = async (): Promise<number | null> => {
    const player = ((await mission.getAttribute('data-mission-player-position')) ?? '')
      .split(',')
      .map(Number);
    const target = ((await mission.getAttribute('data-mission-recenter')) ?? '')
      .split(',')
      .map(Number);
    return player.length === 3 &&
      target.length === 3 &&
      [...player, ...target].every(Number.isFinite)
      ? Math.hypot(player[0] - target[0], player[2] - target[2])
      : null;
  };
  for (let pulse = 0; pulse < maximumPulses; pulse += 1) {
    await recenter.click();
    if (await condition()) return;
    {
      const action = await mission.getAttribute('data-mission-action');
      const actionEnabled = await mission.getAttribute('data-mission-action-enabled');
      const followingCentralVacuoleWaypoint =
        (await mission.getAttribute('data-mission-selected')) === 'centralVacuole' &&
        (await mission.getAttribute('data-mission-recenter-stage')) !== 'central-anchor';
      const blockedByPrefab =
        !followingCentralVacuoleWaypoint &&
        actionEnabled === 'false' &&
        ((await mission.getAttribute('data-mission-target')) === 'structure' || action === 'place');
      let detourDirection = detour;
      if (blockedByPrefab) {
        const [playerX] = ((await mission.getAttribute('data-mission-player-position')) ?? '')
          .split(',')
          .map(Number);
        const [targetX] = ((await mission.getAttribute('data-mission-recenter')) ?? '')
          .split(',')
          .map(Number);
        if (
          Number.isFinite(playerX) &&
          Number.isFinite(targetX) &&
          Math.abs(targetX - playerX) > 0.25
        ) {
          detourDirection = targetX > playerX ? 'right' : 'left';
        }
      }
      if (blockedByPrefab) {
        await holdJoystick(page, detourDirection, 520);
        await recordNavigation(detourDirection);
      } else {
        const before = await distanceToRecenter();
        await holdJoystick(page, 'forward', 220);
        const after = await distanceToRecenter();
        if (before !== null && after !== null && after > before + 0.08) {
          await holdJoystick(page, 'backward', 440);
        }
        await recordNavigation('forward');
      }
    }
  }
  await recenter.click();
  await holdJoystick(page, 'backward', 480);
  for (let pulse = 0; pulse < 16; pulse += 1) {
    await recenter.click();
    if (await condition()) return;
    await holdJoystick(page, 'forward', 130);
  }
  throw new Error(
    `Visible movement did not reach the recentered mission target. phase=${await mission.getAttribute(
      'data-mission-phase',
    )} player=${await mission.getAttribute('data-mission-player')} exact=${await mission.getAttribute(
      'data-mission-player-position',
    )} target=${await mission.getAttribute(
      'data-mission-target',
    )} label=${await mission.getAttribute('data-mission-target-label')} cell=${await mission.getAttribute(
      'data-mission-target-cell',
    )} face=${await mission.getAttribute('data-mission-target-face')} selected=${await mission.getAttribute(
      'data-mission-selected',
    )} action=${await mission.getAttribute('data-mission-action')} enabled=${await mission.getAttribute(
      'data-mission-action-enabled',
    )} recenter=${await mission.getAttribute('data-mission-recenter')} trail=${navigationTrail.join('|')}`,
  );
}

async function approachAction(
  page: Page,
  mission: Locator,
  recenter: Locator,
  expectedAction: string,
  expectedLabel?: RegExp,
  detourOverride?: 'left' | 'right',
): Promise<void> {
  const detour =
    detourOverride ??
    (expectedLabel && /NUCLEUS|MITOCHONDRIA/.test(expectedLabel.source) ? 'left' : 'right');
  const flags =
    expectedLabel && !expectedLabel.flags.includes('i')
      ? `${expectedLabel.flags}i`
      : expectedLabel?.flags;
  const normalizedLabel = expectedLabel ? new RegExp(expectedLabel.source, flags) : null;
  await approachUntil(
    page,
    mission,
    recenter,
    async () => {
      const [action, enabled, label] = await Promise.all([
        mission.getAttribute('data-mission-action'),
        mission.getAttribute('data-mission-action-enabled'),
        mission.getAttribute('data-mission-target-label'),
      ]);
      return (
        action === expectedAction &&
        enabled === 'true' &&
        (!normalizedLabel || normalizedLabel.test(label ?? ''))
      );
    },
    40,
    detour,
  );
  await expect(mission).toHaveAttribute('data-mission-action', expectedAction);
  await expect(mission).toHaveAttribute('data-mission-action-enabled', 'true');
  if (normalizedLabel) {
    await expect(mission).toHaveAttribute('data-mission-target-label', normalizedLabel);
  }
}

async function holdCurrentAction(
  page: Page,
  mission: Locator,
  action: Locator,
  completed: () => Promise<void>,
): Promise<void> {
  const box = await action.boundingBox();
  if (!box) throw new Error('Primary mission action was not visible.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  let dispatchedTouchPointer = false;
  try {
    try {
      await expect(mission).toHaveAttribute('data-mission-action-held', 'true', { timeout: 800 });
    } catch {
      await page.mouse.up();
      await action.dispatchEvent('pointerdown', {
        pointerId: 71,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
      });
      dispatchedTouchPointer = true;
      await expect(mission).toHaveAttribute('data-mission-action-held', 'true');
    }
    await completed();
  } finally {
    if (dispatchedTouchPointer) {
      await action.dispatchEvent('pointerup', {
        pointerId: 71,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 0,
      });
    } else {
      await page.mouse.up();
    }
  }
  await page.waitForTimeout(180);
}

async function mineAndCollect(
  page: Page,
  mission: Locator,
  recenter: Locator,
  action: Locator,
  label: RegExp,
  inventoryAttribute: string,
  expectedCount: string,
): Promise<void> {
  await approachAction(page, mission, recenter, 'mine', label);
  const revision = Number(await mission.getAttribute('data-mission-revision'));
  await holdCurrentAction(page, mission, action, () =>
    expect(mission).toHaveAttribute('data-mission-pickups', '1', { timeout: 5_000 }),
  );
  expect(Number(await mission.getAttribute('data-mission-revision'))).toBeGreaterThan(revision);
  await approachAction(page, mission, recenter, 'collect', /DROP · COLLECT/);
  await action.click();
  await expect(mission).toHaveAttribute(inventoryAttribute, expectedCount);
  await expect(mission).toHaveAttribute('data-mission-pickups', '0');
}

async function placeAndInspectStructure(
  page: Page,
  mission: Locator,
  recenter: Locator,
  action: Locator,
  id: 'nucleus' | 'ribosomes' | 'mitochondria' | 'chloroplasts' | 'centralvacuole',
  label: RegExp,
): Promise<void> {
  const detour = id === 'nucleus' || id === 'mitochondria' ? 'left' : 'right';
  await approachAction(page, mission, recenter, 'place', /VALID .* LOCATION · PLACE/, detour);
  await action.click();
  await expect(mission).toHaveAttribute(`data-mission-${id}-placed`, 'true');
  await expect(mission).toHaveAttribute(`data-mission-${id}-evidence`, 'false');
  await approachAction(page, mission, recenter, 'inspect', label);
  await action.click();
  await expect(mission).toHaveAttribute(`data-mission-${id}-evidence`, 'true');
}

test.describe.configure({ mode: 'serial', retries: 0 });

test('unified voxel mission completes boundary through structures using visible controls', async ({
  page,
  browserName,
}) => {
  test.setTimeout(900_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiRequests: string[] = [];
  const images: EvidenceImage[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1024, height: browserName === 'webkit' ? 680 : 768 });
  await page.goto('/?proof=mission');

  const mission = page.locator('main.voxel-mission');
  const recenter = page.getByRole('button', { name: 'RECENTER' });
  const action = page.locator('.mission-primary-action');
  await expect(mission).toHaveAttribute('data-mission-phase', 'boundary');
  await expect(mission).toHaveAttribute('data-mission-score', '0');
  await expect(mission).toHaveAttribute('data-mission-storage-writes', '0');
  await expect(mission).toHaveAttribute('data-mission-api-requests', '0');
  await capture(page, images, '01-empty-chamber-wall-objective.png');

  const playerBeforePause = await mission.getAttribute('data-mission-player');
  const revisionBeforePause = await mission.getAttribute('data-mission-revision');
  await page.getByRole('button', { name: 'PAUSE' }).click();
  await expect(mission).toHaveAttribute('data-mission-paused', 'true');
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await expect(mission).toHaveAttribute('data-mission-player', playerBeforePause!);
  await expect(mission).toHaveAttribute('data-mission-revision', revisionBeforePause!);
  await page.getByRole('button', { name: 'RESUME VOXEL MISSION' }).click();
  await page.keyboard.up('w');
  await expect(mission).toHaveAttribute('data-mission-paused', 'false');

  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /CELL WALL PANELS SUPPLY/,
    'data-mission-cellwall-inventory',
    '6',
  );
  await capture(page, images, '02-wall-stack-collected.png');

  for (let index = 0; index < 6; index += 1) {
    await approachAction(
      page,
      mission,
      recenter,
      'place',
      /VALID CELL WALL PANELS LOCATION · PLACE/,
    );
    await action.click();
    await expect(mission).toHaveAttribute('data-mission-wall-count', String(index + 1));
    if (index === 0) {
      const count = await mission.getAttribute('data-mission-wall-count');
      const inventory = await mission.getAttribute('data-mission-cellwall-inventory');
      const score = await mission.getAttribute('data-mission-score');
      await expect(mission).toHaveAttribute('data-mission-action-enabled', 'false');
      await expect(mission).toHaveAttribute('data-mission-target-label', /BLOCKED LOCATION/);
      await page.keyboard.press('e');
      await page.waitForTimeout(180);
      await expect(mission).toHaveAttribute('data-mission-wall-count', count!);
      await expect(mission).toHaveAttribute('data-mission-cellwall-inventory', inventory!);
      await expect(mission).toHaveAttribute('data-mission-score', score!);
      await capture(page, images, '03-invalid-overlap-conserves-module.png');
    }
  }
  await approachAction(page, mission, recenter, 'inspect', /OUTER CELL WALL · INSPECT FUNCTION/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-wall-evidence', 'true');

  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /CELL MEMBRANE PANELS SUPPLY/,
    'data-mission-cellmembrane-inventory',
    '6',
  );
  for (let index = 0; index < 6; index += 1) {
    await approachAction(
      page,
      mission,
      recenter,
      'place',
      /VALID CELL MEMBRANE PANELS LOCATION · PLACE/,
    );
    await action.click();
    await expect(mission).toHaveAttribute('data-mission-membrane-count', String(index + 1));
  }
  await approachAction(
    page,
    mission,
    recenter,
    'inspect',
    /INNER CELL MEMBRANE · INSPECT FUNCTION/,
  );
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-membrane-evidence', 'true');
  const boundaryScore = await mission.getAttribute('data-mission-score');
  await capture(page, images, '04-nested-wall-and-membrane.png');

  await expect(mission).toHaveAttribute('data-mission-action', 'remove');
  await holdCurrentAction(page, mission, action, () =>
    expect(mission).toHaveAttribute('data-mission-correction', 'boundary', { timeout: 5_000 }),
  );
  await expect(mission).toHaveAttribute('data-mission-membrane-count', '5');
  await expect(mission).not.toHaveAttribute('data-mission-score', boundaryScore!);
  await capture(page, images, '05-removed-membrane-and-recovery.png');
  await approachAction(page, mission, recenter, 'collect', /DROP · COLLECT/);
  await action.click();
  await approachAction(
    page,
    mission,
    recenter,
    'place',
    /VALID CELL MEMBRANE PANELS LOCATION · PLACE/,
  );
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-membrane-count', '6');
  await expect(mission).toHaveAttribute('data-mission-membrane-evidence', 'false');
  await expect(mission).not.toHaveAttribute('data-mission-score', boundaryScore!);
  await approachAction(
    page,
    mission,
    recenter,
    'inspect',
    /INNER CELL MEMBRANE · INSPECT FUNCTION/,
  );
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-score', boundaryScore!);

  await approachAction(page, mission, recenter, 'interact', /CYTOPLASM CONTROL · ACTIVATE/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-cytoplasm', 'filled');
  await expect(mission).toHaveAttribute('data-mission-cytoplasm-solid-cells', '0');
  await approachAction(page, mission, recenter, 'inspect', /CYTOPLASM FULL-HEIGHT FILL · INSPECT/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-cytoplasm-evidence', 'true');
  await capture(page, images, '06-full-height-non-solid-cytoplasm.png');

  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /NUCLEUS SUPPLY/,
    'data-mission-nucleus-inventory',
    '1',
  );
  await placeAndInspectStructure(page, mission, recenter, action, 'nucleus', /NUCLEUS · INSPECT/);
  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /RIBOSOMES SUPPLY/,
    'data-mission-ribosomes-inventory',
    '1',
  );
  await placeAndInspectStructure(
    page,
    mission,
    recenter,
    action,
    'ribosomes',
    /RIBOSOMES · INSPECT/,
  );
  await capture(page, images, '07-nucleus-and-ribosomes-evidence.png');

  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /MITOCHONDRIA SUPPLY/,
    'data-mission-mitochondria-inventory',
    '1',
  );
  await placeAndInspectStructure(
    page,
    mission,
    recenter,
    action,
    'mitochondria',
    /MITOCHONDRIA · INSPECT/,
  );
  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /CHLOROPLASTS SUPPLY/,
    'data-mission-chloroplasts-inventory',
    '1',
  );
  await placeAndInspectStructure(
    page,
    mission,
    recenter,
    action,
    'chloroplasts',
    /CHLOROPLASTS · INSPECT/,
  );
  await capture(page, images, '08-mitochondria-and-chloroplasts-evidence.png');

  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /LARGE CENTRAL VACUOLE SUPPLY/,
    'data-mission-centralvacuole-inventory',
    '1',
  );
  const playerBeforeVacuoleRecenter = await mission.getAttribute('data-mission-player-position');
  await recenter.click();
  await expect(mission).toHaveAttribute('data-mission-recenter-stage', /central-(entry|side)/);
  await expect(mission).toHaveAttribute(
    'data-mission-player-position',
    playerBeforeVacuoleRecenter!,
  );
  const currentWaypoint = await mission.getAttribute('data-mission-recenter');
  const waypointDistanceBefore = horizontalDistance(playerBeforeVacuoleRecenter, currentWaypoint);
  await holdJoystick(page, 'forward', 220);
  const waypointDistanceAfter = horizontalDistance(
    await mission.getAttribute('data-mission-player-position'),
    currentWaypoint,
  );
  expect(waypointDistanceAfter).toBeLessThan(waypointDistanceBefore);
  await approachUntil(
    page,
    mission,
    recenter,
    async () => (await mission.getAttribute('data-mission-recenter-stage')) === 'central-side',
    16,
  );
  await approachUntil(
    page,
    mission,
    recenter,
    async () => (await mission.getAttribute('data-mission-recenter-stage')) === 'central-anchor',
    16,
  );
  await placeAndInspectStructure(
    page,
    mission,
    recenter,
    action,
    'centralvacuole',
    /LARGE CENTRAL VACUOLE · INSPECT/,
  );
  await expect(mission).toHaveAttribute('data-mission-score', '80');
  await capture(page, images, '09-hydrated-vacuole-and-80-checkpoint.png');

  await page.getByRole('button', { name: 'OVERVIEW' }).click();
  await expect(mission).toHaveAttribute('data-mission-overview', 'true');
  await capture(page, images, '10-overview-all-eight-structures.png');
  await page.getByRole('button', { name: 'CLOSE VIEW' }).click();

  await approachAction(page, mission, recenter, 'remove', /LARGE CENTRAL VACUOLE · REMOVE/);
  await holdCurrentAction(page, mission, action, () =>
    expect(mission).toHaveAttribute('data-mission-correction', 'structure', { timeout: 5_000 }),
  );
  await expect(mission).toHaveAttribute('data-mission-centralvacuole-placed', 'false');
  await expect(mission).not.toHaveAttribute('data-mission-score', '80');
  await capture(page, images, '11-vacuole-removed-with-reachable-drop.png');
  await approachAction(page, mission, recenter, 'collect', /LARGE CENTRAL VACUOLE DROP · COLLECT/);
  await action.click();
  await approachAction(
    page,
    mission,
    recenter,
    'place',
    /VALID LARGE CENTRAL VACUOLE LOCATION · PLACE/,
  );
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-centralvacuole-placed', 'true');
  await expect(mission).toHaveAttribute('data-mission-centralvacuole-evidence', 'false');
  await expect(mission).not.toHaveAttribute('data-mission-score', '80');
  await capture(page, images, '12-vacuole-replaced-before-reinspection.png');
  await approachAction(page, mission, recenter, 'inspect', /LARGE CENTRAL VACUOLE · INSPECT/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-centralvacuole-evidence', 'true');
  await expect(mission).toHaveAttribute('data-mission-score', '80');
  await capture(page, images, '13-vacuole-reinspected-score-restored.png');

  const databases = await page.evaluate(async () =>
    typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases()).map((database) => database.name ?? '')
      : [],
  );
  const browserStorage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    cookies: document.cookie,
  }));
  expect(databases).toEqual([]);
  expect(browserStorage).toEqual({ local: [], session: [], cookies: '' });
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  if (evidenceRoot) {
    expect(images.map(({ file }) => file)).toEqual(EXPECTED_EVIDENCE_FILES);
    expect(new Set(images.map(({ file }) => file)).size).toBe(EXPECTED_EVIDENCE_FILES.length);
    expect(images.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
    await writeFile(
      path.join(evidenceRoot, 'run.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          testedAppSha,
          evidenceHarnessSha,
          route: 'development-unified-voxel-mission',
          browser: browserName,
          viewport: { width: 1024, height: browserName === 'webkit' ? 680 : 768 },
          physicalDeviceEvidence: false,
          screenshots: images,
          semanticGates: {
            visibleControlsOnly: true,
            offTargetMutation: false,
            pauseClearedInput: true,
            invalidPlacementConservedState: true,
            correctionRestoredScore: true,
            cytoplasmSolidCells: 0,
            finalScore: 80,
            storageDatabases: 0,
            apiRequests: 0,
            pageErrors: 0,
            consoleErrors: 0,
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
});

test('unified voxel mission latches graphics loss and rejects later visible input', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1024, height: browserName === 'webkit' ? 680 : 768 });
  await page.goto('/?proof=mission');
  const mission = page.locator('main.voxel-mission');
  await expect(mission).toHaveAttribute('data-mission-revision', /^[1-9]\d*$/);
  await expect(mission).toHaveAttribute('data-mission-target', 'supply');

  const frozen = {
    revision: await mission.getAttribute('data-mission-revision'),
    player: await mission.getAttribute('data-mission-player'),
    score: await mission.getAttribute('data-mission-score'),
    pickups: await mission.getAttribute('data-mission-pickups'),
    wall: await mission.getAttribute('data-mission-wall-count'),
  };
  await page.locator('canvas').evaluate((canvas) => {
    const gl =
      canvas.getContext('webgl2') ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.getByRole('alertdialog')).toContainText('GRAPHICS CONTEXT LOST');
  await expect(mission).toHaveAttribute('data-mission-context-lost', 'true');

  await page.keyboard.down('w');
  await page.keyboard.press('e');
  await page.keyboard.press('f');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await expect(mission).toHaveAttribute('data-mission-revision', frozen.revision!);
  await expect(mission).toHaveAttribute('data-mission-player', frozen.player!);
  await expect(mission).toHaveAttribute('data-mission-score', frozen.score!);
  await expect(mission).toHaveAttribute('data-mission-pickups', frozen.pickups!);
  await expect(mission).toHaveAttribute('data-mission-wall-count', frozen.wall!);
});
