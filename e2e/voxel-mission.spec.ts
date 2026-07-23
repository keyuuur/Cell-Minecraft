import { expect, test, type Locator, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  navigateByVisibleMissionGuidance,
  nudgeMissionCrosshair,
} from './helpers/visibleStudentControls';

const evidenceRoot = process.env.VOXEL_MISSION_EVIDENCE_DIR;
const testedAppSha = process.env.VOXEL_MISSION_TESTED_APP_SHA;
const evidenceHarnessSha = process.env.VOXEL_MISSION_EVIDENCE_HARNESS_SHA;
const EXPECTED_EVIDENCE_FILES = [
  '01-empty-chamber-wall-objective.png',
  '02-wall-stack-collected.png',
  '03-invalid-overlap-conserves-module.png',
  '04-nested-wall-and-membrane.png',
  '05-boundary-locked-before-internal-build.png',
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
const EVIDENCE_HARNESS_PATHS = [
  'e2e/voxel-mission.spec.ts',
  'e2e/helpers/visibleStudentControls.ts',
  'playwright.config.ts',
  'playwright.dev.config.ts',
  'playwright.mechanics.config.ts',
] as const;
const EVIDENCE_SCOPE_PATHS = [...TESTED_APP_PATHS, ...EVIDENCE_HARNESS_PATHS] as const;
const COORDINATE_ROUTE_TITLE =
  '@mechanics-coordinate unified voxel mission completes boundary through structures using visible controls';
const CLASSROOM_ROUTE_TITLE =
  '@mechanics-classroom integrated classroom route reaches one queued immutable 100 percent result through visible controls';

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

const evidenceInProgressPath = evidenceRoot ? path.join(evidenceRoot, '.in-progress') : null;

async function initializeEvidenceDirectory(): Promise<void> {
  if (!evidenceRoot || !evidenceInProgressPath) return;
  await mkdir(path.dirname(evidenceRoot), { recursive: true });
  try {
    await mkdir(evidenceRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        'Evidence freshness failed: VOXEL_MISSION_EVIDENCE_DIR must name a new per-profile directory.',
        { cause: error },
      );
    }
    throw error;
  }
  await writeFile(
    evidenceInProgressPath,
    `${JSON.stringify({ schemaVersion: 1, status: 'in-progress' })}\n`,
    'utf8',
  );
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
  const filePath = path.join(evidenceRoot, file);
  const buffer = await page.screenshot({ path: filePath });
  images.push({ file, sha256: createHash('sha256').update(buffer).digest('hex') });
}

async function expectMissionViewportAnchored(page: Page, mission: Locator): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('The mission viewport size was unavailable.');
  await expect
    .poll(() =>
      mission.evaluate((root) => {
        const rect = root.getBoundingClientRect();
        return {
          bodyScrollTop: Math.round(document.body.scrollTop),
          documentScrollTop: Math.round(document.documentElement.scrollTop),
          left: Math.round(rect.left),
          scrollX: Math.round(window.scrollX),
          scrollY: Math.round(window.scrollY),
          top: Math.round(rect.top),
          height: Math.round(rect.height),
          width: Math.round(rect.width),
        };
      }),
    )
    .toEqual({
      bodyScrollTop: 0,
      documentScrollTop: 0,
      left: 0,
      scrollX: 0,
      scrollY: 0,
      top: 0,
      height: viewport.height,
      width: viewport.width,
    });
  await expect
    .poll(() =>
      mission.evaluate((root) => {
        const isInside = (selector: string): boolean => {
          const element = root.querySelector<HTMLElement>(selector);
          if (!element || getComputedStyle(element).display === 'none') return true;
          const rect = element.getBoundingClientRect();
          return (
            rect.top >= 10 &&
            rect.left >= 0 &&
            rect.right <= window.innerWidth &&
            rect.bottom <= window.innerHeight
          );
        };
        return {
          objectiveInside: isInside('.voxel-proof-objective'),
          utilitiesInside: isInside('.voxel-proof-utilities'),
        };
      }),
    )
    .toEqual({ objectiveInside: true, utilitiesInside: true });
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

async function pulseKeyboardMovement(
  page: Page,
  direction: 'forward' | 'backward' | 'left' | 'right',
  milliseconds: number,
): Promise<void> {
  const key = {
    forward: 'w',
    backward: 's',
    left: 'a',
    right: 'd',
  }[direction];
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
  await page.waitForTimeout(90);
}

async function moveMission(
  page: Page,
  direction: 'forward' | 'backward' | 'left' | 'right',
  milliseconds: number,
): Promise<void> {
  if (test.info().title === COORDINATE_ROUTE_TITLE) {
    await pulseKeyboardMovement(page, direction, milliseconds);
    return;
  }
  await holdJoystick(page, direction, milliseconds);
}

async function approachUntil(
  page: Page,
  mission: Locator,
  recenter: Locator,
  condition: () => Promise<boolean>,
  maximumPulses = 52,
  detour: 'left' | 'right' = 'right',
): Promise<void> {
  await expect(recenter).toBeVisible();
  try {
    await navigateByVisibleMissionGuidance(page, condition, detour, moveMission, maximumPulses);
  } catch (error) {
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
      )} recenter=${await mission.getAttribute('data-mission-recenter')}`,
      { cause: error },
    );
  }
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
    52,
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

test.afterEach(async ({ browser }, testInfo) => {
  const isolatedLongRoute =
    testInfo.title === COORDINATE_ROUTE_TITLE || testInfo.title === CLASSROOM_ROUTE_TITLE;
  if (!isolatedLongRoute && testInfo.status === testInfo.expectedStatus) return;
  // The mechanics config gives each tagged route its own project/worker. Long
  // Chromium/WebKit traces can deadlock the already-empty context fixture, so
  // close that isolated worker after success or failure while preserving the
  // route's primary result and attachments.
  await browser.close({ reason: 'Isolated mechanics route cleanup.' });
});

test(COORDINATE_ROUTE_TITLE, async ({ page, browserName }, testInfo) => {
  test.setTimeout(900_000);
  const routeStartedAt = Date.now();
  let previousStageAt = routeStartedAt;
  const stageTimings: Array<{ stage: string; durationMs: number; elapsedMs: number }> = [];
  const markStage = (stage: string) => {
    const now = Date.now();
    const timing = {
      stage,
      durationMs: now - previousStageAt,
      elapsedMs: now - routeStartedAt,
    };
    stageTimings.push(timing);
    testInfo.annotations.push({ type: 'stage-timing', description: JSON.stringify(timing) });
    previousStageAt = now;
  };
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiRequests: string[] = [];
  const images: EvidenceImage[] = [];
  let offTargetMutation = false;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });

  await initializeEvidenceDirectory();

  await page.setViewportSize({ width: 1024, height: browserName === 'webkit' ? 680 : 768 });
  await page.goto('/?proof=mission');
  if (process.env.MECHANICS_CLEANUP_PROBE === '1') {
    throw new Error('EXPECTED_MECHANICS_CLEANUP_PROBE');
  }

  const mission = page.locator('main.voxel-mission');
  const recenter = page.getByRole('button', { name: 'RECENTER' });
  const action = page.locator('.mission-primary-action');
  await expect(mission).toHaveAttribute('data-mission-phase', 'boundary');
  await expect(mission).toHaveAttribute('data-mission-score', '0');
  await expect(mission).toHaveAttribute('data-mission-storage-writes', '0');
  await expect(mission).toHaveAttribute('data-mission-api-requests', '0');
  await nudgeMissionCrosshair(page, 0);
  const canvasDragLookUsed = true;
  testInfo.annotations.push({ type: 'visible-canvas-drag-look', description: 'true' });
  await recenter.click();
  await expect(page.locator('.voxel-proof-target-label')).toContainText(/CELL WALL PANELS SUPPLY/i);
  await expect(action).toBeEnabled();
  await capture(page, images, '01-empty-chamber-wall-objective.png');

  const playerBeforePause = await mission.getAttribute('data-mission-player');
  const revisionBeforePause = await mission.getAttribute('data-mission-revision');
  await page.getByRole('button', { name: 'PAUSE' }).click();
  await expect(mission).toHaveAttribute('data-mission-paused', 'true');
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await expect(mission).toHaveAttribute('data-mission-player', playerBeforePause!);
  await expect(mission).toHaveAttribute('data-mission-revision', revisionBeforePause!);
  await page.getByRole('button', { name: 'RESUME MISSION' }).click();
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
  markStage('opening-and-wall-supply');

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
      offTargetMutation =
        (await mission.getAttribute('data-mission-wall-count')) !== count ||
        (await mission.getAttribute('data-mission-cellwall-inventory')) !== inventory ||
        (await mission.getAttribute('data-mission-score')) !== score;
      expect(offTargetMutation).toBe(false);
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
  await capture(page, images, '04-nested-wall-and-membrane.png');

  // Corrections stay unavailable until the required internal function evidence is complete.
  // The later vacuole route still proves remove, recover, replace, reinspect, and full-credit
  // restoration without distracting students from the next required build action here.
  await expect(mission).toHaveAttribute('data-mission-action', 'remove');
  await expect(mission).toHaveAttribute('data-mission-action-enabled', 'false');
  await expect(mission).toHaveAttribute('data-mission-membrane-count', '6');
  await expect(mission).toHaveAttribute('data-mission-membrane-evidence', 'true');
  const lockedBoundaryRevision = await mission.getAttribute('data-mission-revision');
  const lockedBoundaryScore = await mission.getAttribute('data-mission-score');
  await page.keyboard.press('e');
  await page.waitForTimeout(180);
  await expect(mission).toHaveAttribute('data-mission-revision', lockedBoundaryRevision!);
  await expect(mission).toHaveAttribute('data-mission-score', lockedBoundaryScore!);
  await expect(mission).toHaveAttribute('data-mission-membrane-count', '6');
  await expect(mission).toHaveAttribute('data-mission-membrane-evidence', 'true');
  await capture(page, images, '05-boundary-locked-before-internal-build.png');

  await approachAction(page, mission, recenter, 'interact', /CYTOPLASM CONTROL · ACTIVATE/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-cytoplasm', 'filled');
  await expect(mission).toHaveAttribute('data-mission-cytoplasm-solid-cells', '0');
  await approachAction(page, mission, recenter, 'inspect', /CYTOPLASM FULL-HEIGHT FILL · INSPECT/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-cytoplasm-evidence', 'true');
  await capture(page, images, '06-full-height-non-solid-cytoplasm.png');
  markStage('boundary-and-cytoplasm');

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
  markStage('genetic-information-and-protein');

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
  markStage('energy-and-photosynthesis');

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
  await moveMission(page, 'forward', 220);
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
  markStage('vacuole-correction-and-restoration');

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
  await testInfo.attach('mechanics-stage-timings', {
    body: Buffer.from(`${JSON.stringify(stageTimings, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });

  if (evidenceRoot) {
    expect(images.map(({ file }) => file)).toEqual(EXPECTED_EVIDENCE_FILES);
    expect(new Set(images.map(({ file }) => file)).size).toBe(EXPECTED_EVIDENCE_FILES.length);
    expect(images.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))).toBe(true);
    const temporaryManifest = path.join(evidenceRoot, 'run.json.tmp');
    const finalManifest = path.join(evidenceRoot, 'run.json');
    await writeFile(
      temporaryManifest,
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
            canvasDragLookUsed,
            offTargetMutation,
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
    await rename(temporaryManifest, finalManifest);
    await unlink(evidenceInProgressPath!);
  }
});

test('@mechanics-context-loss unified voxel mission latches graphics loss and rejects later visible input', async ({
  page,
  browserName,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1024, height: browserName === 'webkit' ? 680 : 768 });
  await page.goto('/?proof=mission');
  const mission = page.locator('main.voxel-mission');
  const recenter = page.getByRole('button', { name: 'RECENTER' });
  await approachAction(page, mission, recenter, 'mine', /CELL WALL PANELS SUPPLY/);
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

  await page.locator('canvas').evaluate((canvas) => {
    const gl =
      canvas.getContext('webgl2') ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
    gl?.getExtension('WEBGL_lose_context')?.restoreContext();
  });
  await page.waitForTimeout(700);
  await expect(page.getByRole('alertdialog')).toContainText('GRAPHICS CONTEXT LOST');
  await expect(mission).toHaveAttribute('data-mission-context-lost', 'true');
  await page.keyboard.down('w');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  await expect(mission).toHaveAttribute('data-mission-revision', frozen.revision!);
  await expect(mission).toHaveAttribute('data-mission-player', frozen.player!);
  await expect(mission).toHaveAttribute('data-mission-score', frozen.score!);
  await expect(mission).toHaveAttribute('data-mission-pickups', frozen.pickups!);
  await expect(mission).toHaveAttribute('data-mission-wall-count', frozen.wall!);
});

async function completeClassroomTutorial(
  page: Page,
  quality: 'low' | 'standard' = 'standard',
): Promise<void> {
  await page.getByRole('radio', { name: /Touch Only/ }).click();
  await page.getByRole('radio', { name: quality === 'low' ? /^Low/ : /^Standard/ }).click();
  const joystick = page.getByLabel('Practice movement joystick');
  const box = await joystick.boundingBox();
  if (!box) throw new Error('Tutorial joystick was not visible.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await joystick.dispatchEvent('pointerdown', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    clientX: center.x,
    clientY: center.y,
  });
  await joystick.dispatchEvent('pointermove', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    clientX: center.x + 50,
    clientY: center.y - 16,
  });
  await joystick.dispatchEvent('pointerup', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
  });
  await page.getByRole('button', { name: 'Hold tool to mine' }).click();
  await page.getByRole('button', { name: 'Collect' }).click();
  await joystick.dispatchEvent('pointerdown', {
    pointerId: 42,
    pointerType: 'touch',
    isPrimary: true,
    clientX: center.x,
    clientY: center.y,
  });
  await joystick.dispatchEvent('pointermove', {
    pointerId: 42,
    pointerType: 'touch',
    isPrimary: true,
    clientX: center.x + 82,
    clientY: center.y - 80,
  });
  await joystick.dispatchEvent('pointerup', {
    pointerId: 42,
    pointerType: 'touch',
    isPrimary: true,
  });
  await page.getByRole('button', { name: 'Place' }).click();
  await page.getByRole('button', { name: 'Inspect' }).click();
  const look = page.getByLabel('Drag here to practice looking');
  const lookBox = await look.boundingBox();
  if (!lookBox) throw new Error('Tutorial look area was not visible.');
  await look.dispatchEvent('pointerdown', {
    pointerId: 43,
    pointerType: 'touch',
    isPrimary: true,
    clientX: lookBox.x + 12,
    clientY: lookBox.y + lookBox.height / 2,
  });
  await look.dispatchEvent('pointermove', {
    pointerId: 43,
    pointerType: 'touch',
    isPrimary: true,
    clientX: lookBox.x + 48,
    clientY: lookBox.y + lookBox.height / 2,
  });
  await look.dispatchEvent('pointerup', {
    pointerId: 43,
    pointerType: 'touch',
    isPrimary: true,
  });
  await page.getByRole('button', { name: 'Recenter' }).click();
  await expect(page.getByRole('button', { name: 'Start mission and timer' })).toBeEnabled();
}

test(CLASSROOM_ROUTE_TITLE, async ({ page, browserName }) => {
  test.setTimeout(900_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiRequests: string[] = [];
  const modelRequests: string[] = [];
  const babylonRequestsBeforeStart: string[] = [];
  let missionStarted = false;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = request.url();
    if (new URL(url).pathname.startsWith('/api/')) apiRequests.push(url);
    if (new URL(url).pathname.startsWith('/models/')) modelRequests.push(url);
    if (
      !missionStarted &&
      (url.includes('@babylonjs') ||
        url.includes('VoxelMissionApp') ||
        url.includes('VoxelMissionScene'))
    ) {
      babylonRequestsBeforeStart.push(url);
    }
  });

  await page.setViewportSize({ width: 1024, height: browserName === 'webkit' ? 680 : 768 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build a Living Cell' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByLabel('First name').fill('Route');
  await page.getByLabel('Last initial').fill('T');
  await page.getByLabel('Class period').selectOption('3');
  await expect(page.getByRole('button', { name: 'Continue to controls' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose and practice your controls' }),
  ).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  const quality = browserName === 'webkit' ? 'low' : 'standard';
  await completeClassroomTutorial(page, quality);
  expect(babylonRequestsBeforeStart).toEqual([]);
  missionStarted = true;
  await page.getByRole('button', { name: 'Start mission and timer' }).click();

  const mission = page.locator('main.voxel-mission');
  const recenter = page.getByRole('button', { name: 'RECENTER' });
  const action = page.locator('.mission-primary-action');
  await expect(mission).toHaveAttribute('data-mission-phase', 'boundary', { timeout: 30_000 });
  await expect(mission).toHaveAttribute('data-mission-quality', quality);
  await expect(mission).toHaveAttribute('data-mission-score', '0');
  await approachAction(page, mission, recenter, 'mine', /CELL WALL PANELS SUPPLY/);
  await expectMissionViewportAnchored(page, mission);
  await page.screenshot({ path: test.info().outputPath('01-classroom-mission-opening.png') });

  await page.getByRole('button', { name: 'PAUSE' }).click();
  await expect(mission).toHaveAttribute('data-mission-paused', 'true');
  const pausedAt = await mission.getAttribute('data-mission-active-ms');
  await page.waitForTimeout(700);
  await expect(mission).toHaveAttribute('data-mission-active-ms', pausedAt!);
  await page.getByRole('button', { name: 'RESUME MISSION' }).click();
  await expect(mission).toHaveAttribute('data-mission-paused', 'false');

  await page.getByRole('button', { name: 'GRADE' }).click();
  await expect(mission).toHaveAttribute('data-active-modal', 'grade');
  await expect(mission).toHaveAttribute('data-mission-paused', 'true');
  const gradePausedAt = await mission.getAttribute('data-mission-active-ms');
  const gradeDialog = page.getByRole('dialog', { name: '0%' });
  await expect(gradeDialog).toBeVisible();
  await expect(
    mission.locator('.voxel-proof-utilities button', { hasText: /^PAUSE$/ }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      mission.evaluate((root) => {
        const active = root.querySelector('[data-mission-modal="grade"]');
        return Array.from(root.children)
          .filter((child) => child !== active)
          .every(
            (child) => child.getAttribute('aria-hidden') === 'true' && (child as HTMLElement).inert,
          );
      }),
    )
    .toBe(true);
  await page.waitForTimeout(700);
  await expect(mission).toHaveAttribute('data-mission-active-ms', gradePausedAt!);
  const returnToMission = page.getByRole('button', { name: 'RETURN TO MISSION' });
  await expect(returnToMission).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(returnToMission).toBeFocused();
  await expectMissionViewportAnchored(page, mission);
  await page.screenshot({ path: test.info().outputPath('00-classroom-grade-modal.png') });
  await page.keyboard.press('Escape');
  await expect(gradeDialog).not.toBeVisible();
  await expect(mission).toHaveAttribute('data-active-modal', 'none');
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
  }
  await approachAction(page, mission, recenter, 'inspect', /OUTER CELL WALL · INSPECT FUNCTION/);
  await action.click();

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
  await approachAction(page, mission, recenter, 'interact', /CYTOPLASM CONTROL · ACTIVATE/);
  await action.click();
  await approachAction(page, mission, recenter, 'inspect', /CYTOPLASM FULL-HEIGHT FILL · INSPECT/);
  await action.click();
  await expectMissionViewportAnchored(page, mission);
  await page.screenshot({ path: test.info().outputPath('02-classroom-boundary-cytoplasm.png') });

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
  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /LARGE CENTRAL VACUOLE SUPPLY/,
    'data-mission-centralvacuole-inventory',
    '1',
  );
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
  if (quality === 'standard') {
    await expect(mission).toHaveAttribute('data-mission-asset-requests', '5');
    await expect(mission).toHaveAttribute('data-mission-asset-failures', '0');
    await expect(mission).toHaveAttribute('data-mission-asset-instances', '5');
    expect(modelRequests.map((url) => new URL(url).pathname).sort()).toEqual([
      '/models/centralVacuole.gltf',
      '/models/chloroplasts.gltf',
      '/models/mitochondria.gltf',
      '/models/nucleus.gltf',
      '/models/ribosomes.gltf',
    ]);
  } else {
    await expect(mission).toHaveAttribute('data-mission-asset-requests', '0');
    await expect(mission).toHaveAttribute('data-mission-asset-failures', '0');
    await expect(mission).toHaveAttribute('data-mission-asset-instances', '0');
    expect(modelRequests).toEqual([]);
  }
  await expect(mission).toHaveAttribute('data-mission-score', '80');
  await expectMissionViewportAnchored(page, mission);
  await page.screenshot({ path: test.info().outputPath('03-classroom-hydrated-cell.png') });

  await approachAction(page, mission, recenter, 'remove', /LARGE CENTRAL VACUOLE · REMOVE/);
  await holdCurrentAction(page, mission, action, () =>
    expect(mission).toHaveAttribute('data-mission-correction', 'structure', { timeout: 5_000 }),
  );
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
  await expect(mission).not.toHaveAttribute('data-mission-score', '80');
  await approachAction(page, mission, recenter, 'inspect', /LARGE CENTRAL VACUOLE · INSPECT/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-score', '80');
  if (quality === 'standard') {
    await expect(mission).toHaveAttribute('data-mission-asset-requests', '5');
    await expect(mission).toHaveAttribute('data-mission-asset-instances', '5');
    expect(modelRequests).toHaveLength(5);
  }

  await approachAction(
    page,
    mission,
    recenter,
    'interact',
    /WATER AVAILABILITY STATION · BEGIN CHALLENGE/,
  );
  await action.click();
  await page.getByRole('button', { name: 'OVERVIEW' }).click();
  await expect(mission).toHaveAttribute('data-mission-overview', 'true');
  await expect(mission).toHaveAttribute('data-mission-score', '90');
  await expect(
    page.getByText(/Less turgor pressure · shrunken vacuole · wilted plant/),
  ).toBeVisible();
  await expectMissionViewportAnchored(page, mission);
  await page.screenshot({ path: test.info().outputPath('04-classroom-drought-overview.png') });
  await page.getByRole('button', { name: 'CLOSE VIEW' }).click();
  await approachAction(
    page,
    mission,
    recenter,
    'recover',
    /WATER AVAILABILITY STATION · RESTORE WATER/,
  );
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-score', '95');
  await page.getByRole('button', { name: 'OVERVIEW' }).click();
  await expect(
    page.getByText(/Turgor pressure restored · refilled vacuole · firm plant again/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'CLOSE VIEW' }).click();
  await expect(page.getByRole('button', { name: 'Submit the final graded result' })).toBeEnabled();
  await page.getByRole('button', { name: 'Submit the final graded result' }).click();

  await expect(page.getByRole('heading', { name: 'Stable cell achieved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
  await expect(page.getByText('Saved on this iPad')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('05-classroom-results.png'),
    fullPage: true,
  });
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  await page.reload();
  await page.getByLabel('First name').fill('Route');
  await page.getByLabel('Last initial').fill('T');
  await page.getByLabel('Class period').selectOption('3');
  await expect(page.getByRole('button', { name: 'Continue to controls' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  await expect(
    page.getByText('A matching saved attempt is available on this device.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resume matching attempt' }).click();
  await expect(page.getByRole('heading', { name: 'Stable cell achieved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
  expect(apiRequests).toEqual([]);
});
