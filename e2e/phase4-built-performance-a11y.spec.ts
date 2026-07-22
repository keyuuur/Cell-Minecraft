import { expect, test, type Locator, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MISSION_PERFORMANCE_BRIDGE_KEY,
  type MissionPerformanceDiagnosticsV1,
} from '../src/game/missionPerformanceDiagnostics';
import {
  approachAction,
  approachUntil,
  completeClassroomTutorial,
  expectMissionViewportAnchored,
  holdCurrentAction,
  mineAndCollect,
} from './helpers/voxelMissionControls';

const outputRoot =
  process.env.PHASE4_AUDIT_OUTPUT_DIR ?? 'output/playwright/phase4-audit-calibration';
const evidenceStatus = process.env.PHASE4_AUDIT_STATUS === 'accepted' ? 'accepted' : 'calibration';
const testedAppSha = process.env.PHASE4_AUDIT_APP_SHA ?? 'calibration-uncommitted';
const evidenceHarnessSha = process.env.PHASE4_AUDIT_HARNESS_SHA ?? 'calibration-uncommitted';
const SYNTHETIC_FIRST_NAME = 'AuditLearner';
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
] as const;

const SCREENSHOTS = {
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
} as const;

type AuditProfile = keyof typeof SCREENSHOTS;

function reportProgress(profile: AuditProfile, stage: string): void {
  if (process.env.PHASE4_AUDIT_PROGRESS === '1') {
    process.stdout.write(`[phase4-audit:${profile}] ${stage}\n`);
  }
}

interface ScreenshotEvidence {
  file: string;
  sha256: string;
}

interface BuildProvenance {
  schemaVersion: 1;
  status: 'accepted';
  testedAppSha: string;
  evidenceHarnessSha: string;
  headSha: string;
  treeSha: string;
  scopeDigest: string;
  distDigest: string;
  scopeClean: true;
}

function git(args: string[], failure: string): void {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`PHASE4_EVIDENCE_PROVENANCE:${failure}`);
}

if (evidenceStatus === 'accepted') {
  if (!/^[0-9a-f]{40}$/.test(testedAppSha) || !/^[0-9a-f]{40}$/.test(evidenceHarnessSha)) {
    throw new Error('PHASE4_EVIDENCE_SHA_REQUIRED');
  }
  git(['cat-file', '-e', `${testedAppSha}^{commit}`], 'APP_SHA_NOT_COMMIT');
  git(['cat-file', '-e', `${evidenceHarnessSha}^{commit}`], 'HARNESS_SHA_NOT_COMMIT');
  git(['diff', '--quiet', testedAppSha, '--', ...AUDIT_SCOPE], 'APP_SCOPE_DIFFERS');
  git(['diff', '--quiet', evidenceHarnessSha, '--', ...AUDIT_SCOPE], 'HARNESS_SCOPE_DIFFERS');
  const status = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', ...AUDIT_SCOPE],
    { cwd: process.cwd(), encoding: 'utf8', windowsHide: true },
  );
  if (status.status !== 0 || status.stdout.trim() !== '') {
    throw new Error('PHASE4_EVIDENCE_SCOPE_NOT_CLEAN');
  }
}

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.close({ runBeforeUnload: false });
});

async function readAcceptedBuildProvenance(page: Page): Promise<BuildProvenance | null> {
  if (evidenceStatus !== 'accepted') return null;
  const response = await page.request.get('/phase4-audit-provenance.json');
  expect(response.ok()).toBe(true);
  const provenance = (await response.json()) as BuildProvenance;
  expect(provenance).toMatchObject({
    schemaVersion: 1,
    status: 'accepted',
    testedAppSha,
    evidenceHarnessSha,
    headSha: testedAppSha,
    scopeClean: true,
  });
  expect(provenance.treeSha).toMatch(/^[0-9a-f]{40}$/);
  expect(provenance.scopeDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(provenance.distDigest).toMatch(/^[0-9a-f]{64}$/);
  return provenance;
}

async function prepareFreshProfileDirectory(profileDirectory: string): Promise<string> {
  await mkdir(outputRoot, { recursive: true });
  try {
    await mkdir(profileDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      const entries = await readdir(profileDirectory);
      throw new Error(`PHASE4_EVIDENCE_PROFILE_NOT_FRESH:${entries.sort().join(',')}`, {
        cause: error,
      });
    }
    throw new Error('PHASE4_EVIDENCE_PROFILE_DIRECTORY_FAILED', { cause: error });
  }
  const marker = path.join(profileDirectory, '.in-progress');
  await writeFile(marker, 'phase4 audit in progress\n');
  return marker;
}

async function capture(
  page: Page,
  profileDirectory: string,
  screenshots: ScreenshotEvidence[],
  file: string,
  fullPage = false,
): Promise<void> {
  await expect(page.getByText(SYNTHETIC_FIRST_NAME, { exact: false })).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.waitForTimeout(120);
  await mkdir(profileDirectory, { recursive: true });
  const buffer = await page.screenshot({ path: path.join(profileDirectory, file), fullPage });
  screenshots.push({ file, sha256: createHash('sha256').update(buffer).digest('hex') });
}

async function verifyPerformanceBridgeIsolation(page: Page): Promise<boolean> {
  const result = await page.evaluate((bridgeKey) => {
    const diagnosticsWindow = window as Window & {
      [key: string]: { read: () => MissionPerformanceDiagnosticsV1 | null } | undefined;
    };
    const descriptor = Object.getOwnPropertyDescriptor(window, bridgeKey);
    const bridge = diagnosticsWindow[bridgeKey];
    if (!descriptor || !bridge) return false;
    const first = bridge.read();
    const secondBeforeMutation = bridge.read();
    if (!first || !secondBeforeMutation) return false;
    first.render.frameOrdinal = -1;
    first.assets.requests = -1;
    const second = bridge.read();
    return Boolean(
      Object.isFrozen(bridge) &&
      descriptor.enumerable === false &&
      descriptor.writable === false &&
      second &&
      second.render.frameOrdinal === secondBeforeMutation.render.frameOrdinal &&
      second.assets.requests === secondBeforeMutation.assets.requests,
    );
  }, MISSION_PERFORMANCE_BRIDGE_KEY);
  expect(result).toBe(true);
  return result;
}

async function installGraphicsLossObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type AuditWindow = Window & { __PHASE4_GRAPHICS_LOSSES__?: number };
    const auditWindow = window as AuditWindow;
    auditWindow.__PHASE4_GRAPHICS_LOSSES__ = 0;
    document.addEventListener(
      'webglcontextlost',
      () => {
        const count = (auditWindow.__PHASE4_GRAPHICS_LOSSES__ ?? 0) + 1;
        auditWindow.__PHASE4_GRAPHICS_LOSSES__ = count;
        const root = document.querySelector<HTMLElement>('main.voxel-mission');
        if (root) root.dataset.auditGraphicsLosses = String(count);
      },
      true,
    );
  });
}

async function graphicsLossCount(page: Page, mission: Locator): Promise<number> {
  const count = await page.evaluate(
    () =>
      (window as Window & { __PHASE4_GRAPHICS_LOSSES__?: number }).__PHASE4_GRAPHICS_LOSSES__ ?? -1,
  );
  await mission.evaluate((root, observed) => {
    root.dataset.auditGraphicsLosses = String(observed);
  }, count);
  return count;
}

async function readPerformance(page: Page): Promise<MissionPerformanceDiagnosticsV1 | null> {
  return page.evaluate(() => {
    const diagnosticsWindow = window as Window & {
      __BUILD_CELL_PERFORMANCE__?: { read: () => MissionPerformanceDiagnosticsV1 | null };
    };
    return diagnosticsWindow.__BUILD_CELL_PERFORMANCE__?.read() ?? null;
  });
}

async function waitForPerformance(page: Page): Promise<MissionPerformanceDiagnosticsV1> {
  await expect
    .poll(async () => (await readPerformance(page))?.instrumentationReady ?? false, {
      timeout: 15_000,
    })
    .toBe(true);
  const diagnostics = await readPerformance(page);
  if (!diagnostics) throw new Error('PHASE4_PERFORMANCE_BRIDGE_MISSING');
  expect(diagnostics.instrumentationError).toBe(false);
  return diagnostics;
}

async function expectNoOverflow(page: Page, mission?: Locator): Promise<boolean> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('PHASE4_VIEWPORT_MISSING');
  const dimensions = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    rootWidth: document.documentElement.scrollWidth,
    rootHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.bodyWidth).toBe(viewport.width);
  expect(dimensions.rootWidth).toBe(viewport.width);
  expect(dimensions.viewportWidth).toBe(viewport.width);
  expect(dimensions.viewportHeight).toBe(viewport.height);
  if (mission) {
    expect(dimensions.bodyHeight).toBe(viewport.height);
    expect(dimensions.rootHeight).toBe(viewport.height);
  }
  if (mission) await expectMissionViewportAnchored(page, mission);
  return true;
}

async function expectOverviewOverlayBounds(page: Page): Promise<boolean> {
  const selectors = [
    '.mission-overview-note',
    '.mission-overview-close',
    '.voxel-classroom-timer',
    '.voxel-classroom-save',
    '.mission-quality-badge',
  ];
  await expect
    .poll(() =>
      page.locator('main.voxel-mission').evaluate((root, overlaySelectors) => {
        const failures: string[] = [];
        for (const selector of overlaySelectors) {
          const element = root.querySelector<HTMLElement>(selector);
          if (!element || getComputedStyle(element).display === 'none') continue;
          const rect = element.getBoundingClientRect();
          if (
            rect.top < 0 ||
            rect.left < 0 ||
            rect.right > window.innerWidth ||
            rect.bottom > window.innerHeight
          ) {
            failures.push(
              `${selector}:${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}`,
            );
          }
        }
        return failures;
      }, selectors),
    )
    .toEqual([]);
  return true;
}

async function expectTouchTargets(
  page: Page,
  selector: string,
  scrollEachIntoView = false,
): Promise<boolean> {
  const targets = page.locator(selector);
  const failures: string[] = [];
  for (let index = 0; index < (await targets.count()); index += 1) {
    const target = targets.nth(index);
    if (scrollEachIntoView) await target.scrollIntoViewIfNeeded();
    const issues = await target.evaluate((element, targetIndex) => {
      if (!(element instanceof HTMLElement)) return [`${targetIndex}:not-html`];
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return [];
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      const issues: string[] = [];
      if (rect.width < 56 || rect.height < 56) {
        issues.push(`${targetIndex}:size:${Math.round(rect.width)}x${Math.round(rect.height)}`);
      }
      if (
        rect.left < 0 ||
        rect.top < 0 ||
        rect.right > window.innerWidth ||
        rect.bottom > window.innerHeight
      ) {
        issues.push(`${targetIndex}:outside`);
      }
      if (!hit || !(hit === element || element.contains(hit) || hit.contains(element))) {
        issues.push(`${targetIndex}:center-hit`);
      }
      return issues;
    }, index);
    failures.push(...issues);
  }
  expect(failures).toEqual([]);
  return true;
}

async function expectMissionControlSeparation(page: Page): Promise<boolean> {
  const overlaps = await page.locator('.voxel-mission').evaluate((root) => {
    const selectors = [
      '.voxel-proof-joystick',
      '.voxel-proof-hotbar',
      '.voxel-proof-actions',
      '.voxel-proof-utilities',
    ];
    const entries = selectors
      .map((selector) => [selector, root.querySelector<HTMLElement>(selector)] as const)
      .filter((entry): entry is readonly [string, HTMLElement] => Boolean(entry[1]))
      .filter(([, element]) => getComputedStyle(element).display !== 'none')
      .map(([selector, element]) => [selector, element.getBoundingClientRect()] as const);
    const failures: string[] = [];
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const [leftName, leftRect] = entries[left];
        const [rightName, rightRect] = entries[right];
        const intersects = !(
          leftRect.right <= rightRect.left ||
          rightRect.right <= leftRect.left ||
          leftRect.bottom <= rightRect.top ||
          rightRect.bottom <= leftRect.top
        );
        if (intersects) failures.push(`${leftName}:${rightName}`);
      }
    }
    return failures;
  });
  expect(overlaps).toEqual([]);
  return true;
}

function relativeLuminance(red: number, green: number, blue: number): number {
  const channels = [red, green, blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: number[], background: number[]): number {
  const foregroundLuminance = relativeLuminance(foreground[0], foreground[1], foreground[2]);
  const backgroundLuminance = relativeLuminance(background[0], background[1], background[2]);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectVoxelAccessibilityStyles(page: Page): Promise<{
  largeTextApplied: boolean;
  highContrastApplied: boolean;
  reducedMotionApplied: boolean;
}> {
  const styles = await page.locator('.voxel-mission').evaluate((root) => {
    const rgb = (value: string): number[] =>
      (value.match(/[\d.]+/g) ?? []).slice(0, 3).map((part) => Number(part));
    const sample = (selector: string, backgroundSelector: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      const background = root.querySelector<HTMLElement>(backgroundSelector);
      if (!element || !background) throw new Error(`missing:${selector}`);
      return {
        color: rgb(getComputedStyle(element).color),
        background: rgb(getComputedStyle(background).backgroundColor),
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      };
    };
    return {
      objective: sample('.voxel-proof-objective h1', '.voxel-proof-objective'),
      feedback: sample('.voxel-proof-feedback', '.voxel-proof-feedback'),
      utility: sample('.voxel-proof-utilities button', '.voxel-proof-utilities button'),
      rootClasses: document.querySelector('[data-testid="app-shell"]')?.className ?? '',
    };
  });
  expect(styles.rootClasses).toContain('large-text');
  expect(styles.rootClasses).toContain('high-contrast');
  expect(styles.rootClasses).toContain('reduced-motion');
  expect(styles.objective.fontSize).toBeGreaterThanOrEqual(17);
  expect(styles.feedback.fontSize).toBeGreaterThanOrEqual(16);
  expect(styles.utility.fontSize).toBeGreaterThanOrEqual(14);
  for (const sample of [styles.objective, styles.feedback, styles.utility]) {
    expect(contrastRatio(sample.color, sample.background)).toBeGreaterThanOrEqual(4.5);
  }
  return {
    largeTextApplied: styles.rootClasses.includes('large-text') && styles.feedback.fontSize >= 16,
    highContrastApplied:
      styles.rootClasses.includes('high-contrast') &&
      [styles.objective, styles.feedback, styles.utility].every(
        (sample) => contrastRatio(sample.color, sample.background) >= 4.5,
      ),
    reducedMotionApplied: styles.rootClasses.includes('reduced-motion'),
  };
}

async function inspectAndCapture(
  page: Page,
  profile: AuditProfile,
  mission: Locator,
  recenter: Locator,
  action: Locator,
  id: string,
  expectedLabel: RegExp,
  screenshots: ScreenshotEvidence[],
  profileDirectory: string,
  standardFile: string,
): Promise<void> {
  await approachAction(page, mission, recenter, 'inspect', expectedLabel);
  await action.click();
  await expect(mission).toHaveAttribute(`data-mission-${id}-evidence`, 'true');
  if (profile === 'chromium-standard') {
    await capture(page, profileDirectory, screenshots, standardFile);
  }
}

async function placeAndInspect(
  page: Page,
  profile: AuditProfile,
  mission: Locator,
  recenter: Locator,
  action: Locator,
  id: string,
  expectedLabel: RegExp,
  screenshots: ScreenshotEvidence[],
  profileDirectory: string,
  standardFile: string,
): Promise<void> {
  const detour = id === 'nucleus' || id === 'mitochondria' ? 'left' : 'right';
  await approachAction(page, mission, recenter, 'place', /VALID .* LOCATION .* PLACE/, detour);
  await action.click();
  await expect(mission).toHaveAttribute(`data-mission-${id}-placed`, 'true');
  await expect(mission).toHaveAttribute(`data-mission-${id}-evidence`, 'false');
  await inspectAndCapture(
    page,
    profile,
    mission,
    recenter,
    action,
    id,
    expectedLabel,
    screenshots,
    profileDirectory,
    standardFile,
  );
}

async function openOverviewAndAssertStatic(
  page: Page,
  mission: Locator,
): Promise<{
  before: MissionPerformanceDiagnosticsV1;
  open: MissionPerformanceDiagnosticsV1;
  frozenSurfacePngBytes: number;
}> {
  const overviewButton = page.getByRole('button', { name: 'OVERVIEW' });
  const playerBefore = await mission.getAttribute('data-mission-player-position');
  const before = await waitForPerformance(page);
  await overviewButton.click();
  await expect(mission).toHaveAttribute('data-mission-overview', 'true');
  await expect(mission).toHaveAttribute('data-mission-render-loop', 'suspended');
  await expectMissionViewportAnchored(page, mission);
  await expectOverviewOverlayBounds(page);
  await expect
    .poll(async () => (await waitForPerformance(page)).overview.staticFrameCount)
    .toBe(before.overview.staticFrameCount + 1);
  await expect(mission).toHaveAttribute('data-overview-surface', 'ready');
  await expect
    .poll(async () =>
      Number.parseFloat(
        await page
          .locator('.mission-overview-note')
          .evaluate((note) => getComputedStyle(note).fontSize),
      ),
    )
    .toBeGreaterThanOrEqual(16);
  const frozenSurfacePngBytes = Number(
    (await mission.getAttribute('data-overview-surface-png-bytes')) ?? '0',
  );
  expect(frozenSurfacePngBytes).toBeGreaterThan(7_500);
  const open = await waitForPerformance(page);
  expect(open.overview.staticFrameCount - before.overview.staticFrameCount).toBe(1);
  await page.waitForTimeout(1_000);
  const still = await waitForPerformance(page);
  expect(still.render.frameOrdinal).toBe(open.render.frameOrdinal);
  expect(await mission.getAttribute('data-mission-player-position')).toBe(playerBefore);
  return { before, open, frozenSurfacePngBytes };
}

async function closeOverviewAndAssertResume(page: Page, mission: Locator): Promise<void> {
  const playerBefore = await mission.getAttribute('data-mission-player-position');
  const before = await waitForPerformance(page);
  await page.getByRole('button', { name: 'CLOSE VIEW' }).click();
  await expect(mission).toHaveAttribute('data-mission-overview', 'false');
  await expect(mission).not.toHaveAttribute('data-overview-surface', 'ready');
  await expect(mission).not.toHaveAttribute('data-overview-surface-png-bytes');
  expect(await mission.evaluate((root) => getComputedStyle(root).backgroundImage)).toBe('none');
  await expect(mission).toHaveAttribute('data-mission-render-loop', 'active');
  await expect
    .poll(async () => (await waitForPerformance(page)).render.frameOrdinal)
    .toBeGreaterThan(before.render.frameOrdinal);
  expect(await mission.getAttribute('data-mission-player-position')).toBe(playerBefore);
}

async function resourceSummary(page: Page, startTime: number) {
  return page.evaluate((minimumStartTime) => {
    const resources = performance
      .getEntriesByType('resource')
      .filter(
        (entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming,
      )
      .filter((entry) => entry.startTime >= minimumStartTime);
    const productResources = resources.filter(
      (entry) => !/sceneInstrumentation/i.test(new URL(entry.name).pathname),
    );
    const modelResources = productResources.filter((entry) =>
      /\/models\//i.test(new URL(entry.name).pathname),
    );
    const values = (entries: PerformanceResourceTiming[]) => ({
      requests: entries.length,
      javascriptRequests: entries.filter((entry) => /\.js(?:$|\?)/i.test(entry.name)).length,
      modelRequests: entries.filter((entry) => /\/models\//i.test(new URL(entry.name).pathname))
        .length,
      transferBytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0),
      encodedBytes: entries.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      decodedBytes: entries.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
      maximumDurationMs:
        Math.round(Math.max(0, ...entries.map((entry) => entry.duration)) * 100) / 100,
    });
    return {
      product: values(productResources),
      models: values(modelResources),
      diagnosticRequests: resources.length - productResources.length,
    };
  }, startTime);
}

test.describe.configure({ mode: 'serial', retries: 0 });

test('ordinary built mission does not expose or request performance instrumentation', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-standard');
  const instrumentationRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/sceneInstrumentation/i.test(pathname)) instrumentationRequests.push(pathname);
  });
  await page.goto('/');
  await page.getByLabel('First name').fill('Normal');
  await page.getByLabel('Last initial').fill('N');
  await page.getByLabel('Class period').selectOption('3');
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  await completeClassroomTutorial(page, 'standard', false);
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.locator('main.voxel-mission')).toHaveAttribute(
    'data-mission-phase',
    'boundary',
  );
  expect(
    await page.evaluate(
      () =>
        '__BUILD_CELL_PERFORMANCE__' in
        (window as Window & { __BUILD_CELL_PERFORMANCE__?: unknown }),
    ),
  ).toBe(false);
  expect(instrumentationRequests).toEqual([]);
});

test('built mission records the wider accessibility and performance gate', async ({
  page,
}, testInfo) => {
  const profile = testInfo.project.name as AuditProfile;
  const quality = profile === 'webkit-low' ? 'low' : 'standard';
  const viewport =
    profile === 'webkit-low' ? { width: 1024, height: 680 } : { width: 1024, height: 768 };
  const profileDirectory = path.join(outputRoot, profile);
  const startedAtUtc = new Date().toISOString();
  const buildProvenance = await readAcceptedBuildProvenance(page);
  const inProgressMarker = await prepareFreshProfileDirectory(profileDirectory);
  const screenshots: ScreenshotEvidence[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiRequests: string[] = [];
  const modelRequests: string[] = [];
  const loaderRequests: string[] = [];
  const preStartMissionRequests: string[] = [];
  let missionStarted = false;

  await installGraphicsLossObserver(page);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/')) apiRequests.push(pathname);
    if (pathname.startsWith('/models/')) modelRequests.push(pathname);
    if (/glTFFileLoader|glTFLoader/i.test(pathname)) loaderRequests.push(pathname);
    if (!missionStarted && /VoxelMissionApp|sceneInstrumentation|glTF|\/models\//i.test(pathname)) {
      preStartMissionRequests.push(pathname);
    }
  });

  await page.setViewportSize(viewport);
  await page.goto('/?diagnostics=performance');
  await expect(page.getByRole('heading', { name: 'Build a Living Cell' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByLabel('First name').fill(SYNTHETIC_FIRST_NAME);
  await page.getByLabel('Last initial').fill('E');
  await page.getByLabel('Class period').selectOption('3');
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose and practice your controls' }),
  ).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await completeClassroomTutorial(page, quality, true);
  await expectTouchTargets(page, '.toggle-row', true);
  await expectNoOverflow(page);
  if (profile === 'webkit-low') {
    await page.getByRole('button', { name: 'Start mission and timer' }).scrollIntoViewIfNeeded();
    await capture(page, profileDirectory, screenshots, '01-tutorial-settings.png', true);
  }
  expect(preStartMissionRequests).toEqual([]);

  const missionStartMark = await page.evaluate(() => performance.now());
  missionStarted = true;
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  const mission = page.locator('main.voxel-mission');
  const recenter = page.getByRole('button', { name: 'RECENTER' });
  const action = page.locator('.mission-primary-action');
  await expect(mission).toHaveAttribute('data-mission-phase', 'boundary', { timeout: 30_000 });
  const actionableMs = await page.evaluate((start) => performance.now() - start, missionStartMark);
  expect(actionableMs).toBeLessThanOrEqual(10_000);
  await expect(mission).toHaveAttribute('data-mission-quality', quality);
  await expect(mission).toHaveAttribute('data-mission-muted', 'true');
  await expect(mission).toHaveAttribute('data-mission-reduced-motion', 'true');
  const missionViewportLayout = await expectNoOverflow(page, mission);
  const missionTouchTargets = await expectTouchTargets(
    page,
    '.voxel-mission button:not([disabled]), .voxel-mission [role="application"]',
  );
  const missionControlsSeparated = await expectMissionControlSeparation(page);
  const accessibilityGates = await expectVoxelAccessibilityStyles(page);
  const touchTargetsAndLayout =
    missionViewportLayout && missionTouchTargets && missionControlsSeparated;
  const openingDiagnostics = await waitForPerformance(page);
  const performanceBridgeReadOnly = await verifyPerformanceBridgeIsolation(page);
  expect(openingDiagnostics.effectiveReducedMotion).toBe(true);
  const renderPixels = openingDiagnostics.render.width * openingDiagnostics.render.height;
  const cssPixels = viewport.width * viewport.height;
  expect(renderPixels).toBeLessThanOrEqual(cssPixels * (quality === 'low' ? 1 : 2.25));
  if (profile === 'webkit-low') {
    await capture(page, profileDirectory, screenshots, '02-mission-opening.png');
  }

  const pauseButton = page.getByRole('button', { name: 'PAUSE' });
  await pauseButton.click();
  const pausedAt = await mission.getAttribute('data-mission-active-ms');
  await expect(page.getByRole('dialog', { name: 'Input is cleared' })).toBeVisible();
  const initialResume = page.getByRole('button', { name: 'RESUME MISSION' });
  await expect(initialResume).toBeFocused();
  await page.waitForTimeout(700);
  await expect(mission).toHaveAttribute('data-mission-active-ms', pausedAt!);
  const pauseTimerFrozen = (await mission.getAttribute('data-mission-active-ms')) === pausedAt;
  const initialResumeFocused = await initialResume.evaluate(
    (button) => document.activeElement === button,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Input is cleared' })).not.toBeVisible();
  await expect(pauseButton).toBeFocused();
  const pauseFocusRestored = await pauseButton.evaluate(
    (button) => document.activeElement === button,
  );

  const gradeButton = page.getByRole('button', { name: 'GRADE' });
  await gradeButton.click();
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
  const gradeBackgroundInert = await mission.evaluate((root) => {
    const active = root.querySelector('[data-mission-modal="grade"]');
    return Array.from(root.children)
      .filter((child) => child !== active)
      .every(
        (child) => child.getAttribute('aria-hidden') === 'true' && (child as HTMLElement).inert,
      );
  });
  const gradeReturn = page.getByRole('button', { name: 'RETURN TO MISSION' });
  await expect(gradeReturn).toBeFocused();
  const gradeInitiallyFocused = await gradeReturn.evaluate(
    (button) => document.activeElement === button,
  );
  await page.keyboard.press('Tab');
  await expect(gradeReturn).toBeFocused();
  const gradeFocusTrapped = await gradeReturn.evaluate(
    (button) => document.activeElement === button,
  );
  if (profile === 'webkit-low') {
    await capture(page, profileDirectory, screenshots, '03-grade-modal.png');
  }
  await page.keyboard.press('Escape');
  await expect(gradeDialog).not.toBeVisible();
  await expect(gradeButton).toBeFocused();
  const gradeFocusRestored = await gradeButton.evaluate(
    (button) => document.activeElement === button,
  );
  const modalFocusAndTimerSafety =
    pauseTimerFrozen &&
    initialResumeFocused &&
    pauseFocusRestored &&
    gradeBackgroundInert &&
    gradeInitiallyFocused &&
    gradeFocusTrapped &&
    gradeFocusRestored;
  expect(modalFocusAndTimerSafety).toBe(true);

  await openOverviewAndAssertStatic(page, mission);
  await expect(page.getByText('Not yet established')).toBeVisible();
  if (profile === 'webkit-low') {
    await capture(page, profileDirectory, screenshots, '04-overview-not-established.png');
  }
  await closeOverviewAndAssertResume(page, mission);
  const resourceBeforeOverviewCycles = await waitForPerformance(page);
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await page.getByRole('button', { name: 'OVERVIEW' }).click();
    await expect(mission).toHaveAttribute('data-mission-render-loop', 'suspended');
    await page.getByRole('button', { name: 'CLOSE VIEW' }).click();
    await expect(mission).toHaveAttribute('data-mission-render-loop', 'active');
  }
  const resourceAfterOverviewCycles = await waitForPerformance(page);
  const overviewCycleResourcesStable =
    resourceAfterOverviewCycles.render.totalMeshes ===
      resourceBeforeOverviewCycles.render.totalMeshes &&
    resourceAfterOverviewCycles.render.materials ===
      resourceBeforeOverviewCycles.render.materials &&
    resourceAfterOverviewCycles.render.textures === resourceBeforeOverviewCycles.render.textures;
  expect(overviewCycleResourcesStable).toBe(true);

  let orientationRecovery: boolean | null = null;
  if (profile === 'webkit-low') {
    const joystick = page.getByRole('application', { name: /Movement joystick/ });
    const joystickBox = await joystick.boundingBox();
    if (!joystickBox) throw new Error('PHASE4_ORIENTATION_JOYSTICK_MISSING');
    const joystickCenter = {
      x: joystickBox.x + joystickBox.width / 2,
      y: joystickBox.y + joystickBox.height / 2,
    };
    await joystick.dispatchEvent('pointerdown', {
      pointerId: 88,
      pointerType: 'touch',
      isPrimary: true,
      clientX: joystickCenter.x,
      clientY: joystickCenter.y,
    });
    await joystick.dispatchEvent('pointermove', {
      pointerId: 88,
      pointerType: 'touch',
      isPrimary: true,
      clientX: joystickCenter.x + 40,
      clientY: joystickCenter.y - 40,
    });
    await page.setViewportSize({ width: 680, height: 1024 });
    const orientationDialog = page.getByRole('dialog', { name: 'Rotate to landscape' });
    await expect(orientationDialog).toBeVisible();
    const frozen = {
      active: await mission.getAttribute('data-mission-active-ms'),
      revision: await mission.getAttribute('data-mission-revision'),
      player: await mission.getAttribute('data-mission-player-position'),
      score: await mission.getAttribute('data-mission-score'),
      wallInventory: await mission.getAttribute('data-mission-cellwall-inventory'),
    };
    await expect(mission).toHaveAttribute('data-mission-action-held', 'false');
    await expect(page.locator('.voxel-proof-joystick-thumb')).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)',
    );
    await page.waitForTimeout(700);
    await expect(mission).toHaveAttribute('data-mission-active-ms', frozen.active!);
    await expect(mission).toHaveAttribute('data-mission-revision', frozen.revision!);
    await expect(mission).toHaveAttribute('data-mission-player-position', frozen.player!);
    await expect(mission).toHaveAttribute('data-mission-score', frozen.score!);
    await expect(mission).toHaveAttribute('data-mission-cellwall-inventory', frozen.wallInventory!);
    await capture(page, profileDirectory, screenshots, '05-orientation-interruption.png');
    await page.setViewportSize(viewport);
    await expect(orientationDialog).not.toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Input is cleared' })).toBeVisible();
    const resumeMission = page.getByRole('button', { name: 'RESUME MISSION' });
    await expect(resumeMission).toBeFocused();
    await expect(resumeMission).toHaveCSS('outline-style', 'solid');
    await capture(page, profileDirectory, screenshots, '06-landscape-pause.png');
    await resumeMission.click();
    await expect(mission).toHaveAttribute('data-mission-paused', 'false');
    orientationRecovery = await expectNoOverflow(page, mission);
  }

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
      /VALID CELL WALL PANELS LOCATION .* PLACE/,
    );
    await action.click();
    await expect(mission).toHaveAttribute('data-mission-wall-count', String(index + 1));
  }
  await approachAction(page, mission, recenter, 'inspect', /OUTER CELL WALL .* INSPECT FUNCTION/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-wall-evidence', 'true');
  if (profile === 'chromium-standard') {
    await capture(page, profileDirectory, screenshots, '01-cell-wall-function.png');
  }

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
      /VALID CELL MEMBRANE PANELS LOCATION .* PLACE/,
    );
    await action.click();
    await expect(mission).toHaveAttribute('data-mission-membrane-count', String(index + 1));
  }
  await approachAction(
    page,
    mission,
    recenter,
    'inspect',
    /INNER CELL MEMBRANE .* INSPECT FUNCTION/,
  );
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-membrane-evidence', 'true');
  if (profile === 'chromium-standard') {
    await capture(page, profileDirectory, screenshots, '02-cell-membrane-function.png');
  }

  await approachAction(page, mission, recenter, 'interact', /CYTOPLASM CONTROL .* ACTIVATE/);
  await action.click();
  await approachAction(page, mission, recenter, 'inspect', /CYTOPLASM FULL-HEIGHT FILL .* INSPECT/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-cytoplasm-evidence', 'true');
  if (profile === 'chromium-standard') {
    await capture(page, profileDirectory, screenshots, '03-cytoplasm-function.png');
  }

  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /NUCLEUS SUPPLY/,
    'data-mission-nucleus-inventory',
    '1',
  );
  await placeAndInspect(
    page,
    profile,
    mission,
    recenter,
    action,
    'nucleus',
    /NUCLEUS .* INSPECT/,
    screenshots,
    profileDirectory,
    '04-nucleus-function.png',
  );
  await mineAndCollect(
    page,
    mission,
    recenter,
    action,
    /RIBOSOMES SUPPLY/,
    'data-mission-ribosomes-inventory',
    '1',
  );
  await placeAndInspect(
    page,
    profile,
    mission,
    recenter,
    action,
    'ribosomes',
    /RIBOSOMES .* INSPECT/,
    screenshots,
    profileDirectory,
    '05-ribosomes-function.png',
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
  await placeAndInspect(
    page,
    profile,
    mission,
    recenter,
    action,
    'mitochondria',
    /MITOCHONDRIA .* INSPECT/,
    screenshots,
    profileDirectory,
    '06-mitochondria-function.png',
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
  await placeAndInspect(
    page,
    profile,
    mission,
    recenter,
    action,
    'chloroplasts',
    /CHLOROPLASTS .* INSPECT/,
    screenshots,
    profileDirectory,
    '07-chloroplasts-function.png',
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
  await placeAndInspect(
    page,
    profile,
    mission,
    recenter,
    action,
    'centralvacuole',
    /LARGE CENTRAL VACUOLE .* INSPECT/,
    screenshots,
    profileDirectory,
    '08-central-vacuole-function.png',
  );
  reportProgress(profile, 'all-structure-frames-complete');
  await expect(mission).toHaveAttribute('data-mission-score', '80');
  await expect.poll(async () => (await waitForPerformance(page)).assets.pendingLoads).toBe(0);
  const assembledDiagnostics = await waitForPerformance(page);
  reportProgress(profile, 'assembled-diagnostics-settled');
  const uniqueModelRequests = [...new Set(modelRequests)].sort();
  let correctQualityPath = openingDiagnostics.quality === quality;
  if (quality === 'standard') {
    const expectedModels = [
      '/models/centralVacuole.gltf',
      '/models/chloroplasts.gltf',
      '/models/mitochondria.gltf',
      '/models/nucleus.gltf',
      '/models/ribosomes.gltf',
    ];
    correctQualityPath =
      correctQualityPath &&
      assembledDiagnostics.assets.requests === 5 &&
      assembledDiagnostics.assets.failures === 0 &&
      assembledDiagnostics.assets.pendingLoads === 0 &&
      assembledDiagnostics.assets.activeInstances === 5 &&
      JSON.stringify(uniqueModelRequests) === JSON.stringify(expectedModels);
  } else {
    correctQualityPath =
      correctQualityPath &&
      assembledDiagnostics.assets.requests === 0 &&
      assembledDiagnostics.assets.failures === 0 &&
      assembledDiagnostics.assets.pendingLoads === 0 &&
      assembledDiagnostics.assets.activeInstances === 0 &&
      modelRequests.length === 0 &&
      loaderRequests.length === 0;
  }
  expect(correctQualityPath).toBe(true);

  if (profile === 'webkit-low') {
    await openOverviewAndAssertStatic(page, mission);
    await expect(
      page.getByText(/More turgor pressure .* full vacuole .* firm plant/),
    ).toBeVisible();
    await expect(page.getByText('Firm plant · leaves stand up')).toBeVisible();
    await capture(page, profileDirectory, screenshots, '07-overview-hydrated.png');
    await closeOverviewAndAssertResume(page, mission);
  }

  const resourcesBeforeRemoval = await waitForPerformance(page);
  reportProgress(profile, 'correction-cycle-started');
  await approachAction(page, mission, recenter, 'remove', /LARGE CENTRAL VACUOLE .* REMOVE/);
  await holdCurrentAction(page, mission, action, () =>
    expect(mission).toHaveAttribute('data-mission-correction', 'structure', { timeout: 5_000 }),
  );
  await approachAction(page, mission, recenter, 'collect', /LARGE CENTRAL VACUOLE DROP .* COLLECT/);
  await action.click();
  await approachAction(
    page,
    mission,
    recenter,
    'place',
    /VALID LARGE CENTRAL VACUOLE LOCATION .* PLACE/,
  );
  await action.click();
  await expect(mission).not.toHaveAttribute('data-mission-score', '80');
  await approachAction(page, mission, recenter, 'inspect', /LARGE CENTRAL VACUOLE .* INSPECT/);
  await action.click();
  await expect(mission).toHaveAttribute('data-mission-score', '80');
  const correctionScoreRestored = (await mission.getAttribute('data-mission-score')) === '80';
  await expect.poll(async () => (await waitForPerformance(page)).assets.pendingLoads).toBe(0);
  const resourcesAfterReplacement = await waitForPerformance(page);
  reportProgress(profile, 'correction-cycle-restored');
  const replacementSceneResourcesStable =
    resourcesAfterReplacement.render.totalMeshes === resourcesBeforeRemoval.render.totalMeshes &&
    resourcesAfterReplacement.render.materials === resourcesBeforeRemoval.render.materials &&
    resourcesAfterReplacement.render.textures === resourcesBeforeRemoval.render.textures &&
    resourcesAfterReplacement.assets.activeInstances ===
      resourcesBeforeRemoval.assets.activeInstances;
  const removalReplacementRestoredCredit =
    correctionScoreRestored && replacementSceneResourcesStable;
  expect(removalReplacementRestoredCredit).toBe(true);

  await approachAction(
    page,
    mission,
    recenter,
    'interact',
    /WATER AVAILABILITY STATION .* BEGIN CHALLENGE/,
  );
  await action.click();
  reportProgress(profile, 'drought-challenge-started');
  await openOverviewAndAssertStatic(page, mission);
  await expect(
    page.getByText(/Less turgor pressure .* shrunken vacuole .* wilted plant/),
  ).toBeVisible();
  await expect(page.getByText('Wilted plant · leaves droop down')).toBeVisible();
  if (profile === 'webkit-low') {
    await capture(page, profileDirectory, screenshots, '08-overview-drought.png');
  }
  await closeOverviewAndAssertResume(page, mission);
  await approachAction(
    page,
    mission,
    recenter,
    'recover',
    /WATER AVAILABILITY STATION .* RESTORE WATER/,
  );
  await action.click();
  reportProgress(profile, 'water-restored');
  const restoredOverview = await openOverviewAndAssertStatic(page, mission);
  const finalOverviewSurfacePngBytes = restoredOverview.frozenSurfacePngBytes;
  await expect(
    page.getByText(/Turgor pressure restored .* refilled vacuole .* firm plant again/),
  ).toBeVisible();
  await expect(page.getByText('Firm plant restored · leaves stand up')).toBeVisible();
  if (profile === 'webkit-low') {
    await capture(page, profileDirectory, screenshots, '09-overview-restored.png');
  }
  const overviewDiagnostics = await waitForPerformance(page);
  await closeOverviewAndAssertResume(page, mission);
  const overviewStaticAndSceneResourcesStable =
    overviewCycleResourcesStable &&
    replacementSceneResourcesStable &&
    finalOverviewSurfacePngBytes > 75_000;
  expect(overviewStaticAndSceneResourcesStable).toBe(true);
  const graphicsLosses = await graphicsLossCount(page, mission);
  expect(graphicsLosses).toBe(0);
  const allEightStructuresInspected = (
    await Promise.all(
      [
        'data-mission-wall-evidence',
        'data-mission-membrane-evidence',
        'data-mission-cytoplasm-evidence',
        'data-mission-nucleus-evidence',
        'data-mission-ribosomes-evidence',
        'data-mission-mitochondria-evidence',
        'data-mission-chloroplasts-evidence',
        'data-mission-centralvacuole-evidence',
      ].map((attribute) => mission.getAttribute(attribute)),
    )
  ).every((value) => value === 'true');
  expect(allEightStructuresInspected).toBe(true);
  const missionMuted = (await mission.getAttribute('data-mission-muted')) === 'true';
  await expect(page.getByRole('button', { name: 'Submit the final graded result' })).toBeEnabled();
  await page.getByRole('button', { name: 'Submit the final graded result' }).click();
  await expect(page.getByRole('heading', { name: 'Stable cell achieved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
  await expect(page.getByText('Saved on this iPad')).toBeVisible();
  const immutableLocalResult100 =
    (await page.getByRole('heading', { name: 'Stable cell achieved' }).isVisible()) &&
    (await page.getByRole('heading', { name: '100%' }).isVisible()) &&
    (await page.getByText('Saved on this iPad').isVisible());
  expect(immutableLocalResult100).toBe(true);
  reportProgress(profile, 'immutable-result-complete');
  if (profile === 'webkit-low') {
    await capture(page, profileDirectory, screenshots, '10-results.png');
  }

  expect(screenshots.map((image) => image.file)).toEqual([...SCREENSHOTS[profile]]);
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  const mediaElementCount = await page.locator('audio, video').count();
  const audioResourcesAbsent = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .every((entry) => !/\.(?:mp3|m4a|ogg|wav|aac)(?:$|\?)/i.test(entry.name)),
  );
  const mutedWithoutAudioOnlyInformation =
    missionMuted && mediaElementCount === 0 && audioResourcesAbsent;
  expect(mutedWithoutAudioOnlyInformation).toBe(true);
  const resources = await resourceSummary(page, missionStartMark);
  const endedAtUtc = new Date().toISOString();

  const manifest = {
    schemaVersion: 2,
    auditKind: 'phase4-built-performance-accessibility',
    countedRun: null,
    rolloutRecounted: false,
    physicalDeviceEvidence: false,
    target: 'local-built',
    evidenceStatus,
    testedAppSha,
    evidenceHarnessSha,
    buildProvenance,
    startedAtUtc,
    endedAtUtc,
    profile: {
      id: profile,
      browserEngine: profile === 'webkit-low' ? 'webkit' : 'chromium',
      viewport,
      quality,
      controls: 'touch-only',
      accessibility: {
        largeText: true,
        highContrast: true,
        reducedMotion: true,
        muted: true,
      },
    },
    timings: {
      startToActionableMs: Math.round(actionableMs * 100) / 100,
      rendererFirstFrameMs: openingDiagnostics.marks.firstRenderedFrameMs,
      longestModelRequestMs: resources.models.maximumDurationMs,
    },
    resources,
    diagnostics: {
      opening: openingDiagnostics,
      assembled: assembledDiagnostics,
      overview: overviewDiagnostics,
      replacement: resourcesAfterReplacement,
      frozenOverviewSurfacePngBytes: finalOverviewSurfacePngBytes,
    },
    semanticGates: {
      noPreStartMissionAssets: preStartMissionRequests.length === 0,
      noBackendRequests: apiRequests.length === 0,
      builtStartWithinLocalCeiling: actionableMs <= 10_000,
      correctQualityPath,
      performanceBridgeReadOnly,
      allEightStructuresInspected,
      removalReplacementRestoredCredit,
      overviewStaticAndSceneResourcesStable,
      touchTargetsAndLayout,
      largeTextApplied: accessibilityGates.largeTextApplied,
      highContrastApplied: accessibilityGates.highContrastApplied,
      reducedMotionApplied: accessibilityGates.reducedMotionApplied,
      mutedWithoutAudioOnlyInformation,
      modalFocusAndTimerSafety,
      ...(profile === 'webkit-low' ? { orientationRecovery: orientationRecovery === true } : {}),
      immutableLocalResult100,
      noGraphicsLoss: graphicsLosses === 0,
    },
    screenshots,
    errors: {
      page: pageErrors,
      console: consoleErrors,
      webglContextLosses: graphicsLosses,
    },
  };
  const temporaryManifest = path.join(profileDirectory, 'run.json.tmp');
  const finalManifest = path.join(profileDirectory, 'run.json');
  await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  await page.close({ runBeforeUnload: false });
  reportProgress(profile, 'page-closed');
  await rename(temporaryManifest, finalManifest);
  await unlink(inProgressMarker);
  reportProgress(profile, 'manifest-written');
});

test('synthetic graphics context loss is terminal until reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-low');
  await page.goto('/');
  await page.getByLabel('First name').fill('GraphicsCheck');
  await page.getByLabel('Last initial').fill('G');
  await page.getByLabel('Class period').selectOption('3');
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  await completeClassroomTutorial(page, 'low', false);
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  const mission = page.locator('main.voxel-mission');
  const canvas = mission.locator('canvas');
  await expect(mission).toHaveAttribute('data-mission-phase', 'boundary');
  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
  await expect(
    page.getByRole('alertdialog', { name: 'The voxel mission stopped safely' }),
  ).toBeVisible();
  await expect(mission).toHaveAttribute('data-mission-context-lost', 'true');
  await expect(mission).toHaveAttribute('data-mission-render-loop', 'suspended');
  const frozen = {
    active: await mission.getAttribute('data-mission-active-ms'),
    revision: await mission.getAttribute('data-mission-revision'),
    player: await mission.getAttribute('data-mission-player-position'),
    score: await mission.getAttribute('data-mission-score'),
    inventory: await mission.getAttribute('data-mission-cellwall-inventory'),
  };
  await page.keyboard.down('KeyW');
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 901,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 512,
    clientY: 340,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId: 901,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 620,
    clientY: 340,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: 901,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 620,
    clientY: 340,
  });
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(700);
  await expect(mission).toHaveAttribute('data-mission-active-ms', frozen.active!);
  await expect(mission).toHaveAttribute('data-mission-revision', frozen.revision!);
  await expect(mission).toHaveAttribute('data-mission-player-position', frozen.player!);
  await expect(mission).toHaveAttribute('data-mission-score', frozen.score!);
  await expect(mission).toHaveAttribute('data-mission-cellwall-inventory', frozen.inventory!);
  await expect(mission).toHaveAttribute('data-mission-action-held', 'false');
});
