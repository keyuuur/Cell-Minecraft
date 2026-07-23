import { expect, type Page, test } from '@playwright/test';
import {
  completeVisibleTouchTutorial,
  mineAndCollectVisibleSupply,
  navigateToVisibleAction,
  placeAndInspectVisibleStructure,
} from './helpers/visibleStudentControls';

const RELEASE_CONTEXT_LOSS_ATTRIBUTE = 'data-release-webgl-context-losses';
const RELEASE_CONTEXT_LOSS_STOP_EVENT = 'release-audit-stop-context-loss-observer';

async function installReleaseContextLossObserver(page: Page): Promise<void> {
  await page.addInitScript(
    ({ attribute, stopEvent }) => {
      const controller = new AbortController();
      let losses = 0;
      const reflectLosses = () => document.documentElement?.setAttribute(attribute, String(losses));
      reflectLosses();
      document.addEventListener('readystatechange', reflectLosses, {
        signal: controller.signal,
      });
      window.addEventListener(
        'webglcontextlost',
        () => {
          losses += 1;
          reflectLosses();
        },
        { capture: true, signal: controller.signal },
      );
      window.addEventListener(stopEvent, () => controller.abort(), {
        once: true,
        signal: controller.signal,
      });
    },
    {
      attribute: RELEASE_CONTEXT_LOSS_ATTRIBUTE,
      stopEvent: RELEASE_CONTEXT_LOSS_STOP_EVENT,
    },
  );
}

async function assertAndStopReleaseContextLossObserver(page: Page): Promise<void> {
  const root = page.locator('html');
  await expect(root).toHaveAttribute(RELEASE_CONTEXT_LOSS_ATTRIBUTE, '0');
  await root.dispatchEvent(RELEASE_CONTEXT_LOSS_STOP_EVENT, { bubbles: true });
}

test.describe.configure({ mode: 'serial', retries: 0, timeout: 900_000 });

test.afterEach(async ({ browser }, testInfo) => {
  if (!testInfo.title.startsWith('@release-blackbox ')) return;
  // This route must remain last in the serial file/project. Direct page closure
  // is asserted in the body; closing the worker browser then bypasses a proven
  // Playwright Chromium deadlock while closing its already-empty context fixture.
  await browser.close({ reason: 'Release black-box route finished.' });
});

test('@release-lifecycle closes a live Standard WebGL mission', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await installReleaseContextLossObserver(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await page.getByLabel('First name').fill('Lifecycle');
  await page.getByLabel('Last initial').fill('L');
  await page.getByLabel('Class period').selectOption('4');
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  await page.getByRole('radio', { name: /Touch Only/ }).click();
  await page.getByRole('radio', { name: /^Standard/ }).click();
  await completeVisibleTouchTutorial(page);
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.locator('main.voxel-mission')).toBeVisible({ timeout: 30_000 });
  await assertAndStopReleaseContextLossObserver(page);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await page.close({ runBeforeUnload: false });
});

test('@release-blackbox completes the visible student mission at 100 percent', async ({
  page,
  browserName,
}, testInfo) => {
  const routeStartedAt = Date.now();
  let previousStageAt = routeStartedAt;
  const stageTimings: Array<{ stage: string; durationMs: number; elapsedMs: number }> = [];
  const markStage = (stage: string) => {
    const now = Date.now();
    stageTimings.push({
      stage,
      durationMs: now - previousStageAt,
      elapsedMs: now - routeStartedAt,
    });
    previousStageAt = now;
  };
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const babylonRequestsBeforeStart: string[] = [];
  let missionStarted = false;

  await installReleaseContextLossObserver(page);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (missionStarted) return;
    const pathname = new URL(request.url()).pathname;
    if (/babylon|VoxelMission|\/models\//i.test(pathname)) {
      babylonRequestsBeforeStart.push(pathname);
    }
  });

  await page.setViewportSize({ width: 1024, height: browserName === 'webkit' ? 680 : 768 });
  await page.goto('/');
  const servedCommit = await page.locator('meta[name="build-commit-sha"]').getAttribute('content');
  const expectedCommit = process.env.E2E_EXPECTED_SHA;
  if (expectedCommit) expect(servedCommit).toBe(expectedCommit.toLowerCase());
  else expect(servedCommit).toMatch(/^(local|[0-9a-f]{40})$/);
  await expect(page.getByRole('heading', { name: 'Build a Living Cell' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByText(/TEST MODE/)).toHaveCount(0);
  await expect(page.locator('.mission-test-tools')).toHaveCount(0);

  await page.getByLabel('First name').fill('Release');
  await page.getByLabel('Last initial').fill('R');
  await page.getByLabel('Class period').selectOption('4');
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  await page.getByRole('radio', { name: /Touch Only/ }).click();
  await page.getByRole('radio', { name: browserName === 'webkit' ? /^Low/ : /^Standard/ }).click();
  await completeVisibleTouchTutorial(page);
  expect(babylonRequestsBeforeStart).toEqual([]);

  missionStarted = true;
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.locator('main.voxel-mission')).toBeVisible({ timeout: 30_000 });
  if (process.env.RELEASE_BLACKBOX_CLEANUP_PROBE === '1') {
    throw new Error('EXPECTED_RELEASE_BLACKBOX_CLEANUP_PROBE');
  }
  markStage('identification-and-tutorial');

  await mineAndCollectVisibleSupply(page, 'Cell wall panels');
  for (let index = 1; index <= 6; index += 1) {
    const place = await navigateToVisibleAction(
      page,
      /Place Cell wall panels/i,
      /Valid Cell wall panels location/i,
    );
    await place.click();
    await expect(page.getByText(`WALL ${index}/6`, { exact: true })).toBeVisible();
  }
  const inspectWall = await navigateToVisibleAction(
    page,
    /Inspect Cell wall panels function/i,
    /Outer cell wall.*inspect/i,
  );
  await inspectWall.click();
  await expect(page.getByText('FUNCTIONS 1/8', { exact: true })).toBeVisible();

  await mineAndCollectVisibleSupply(page, 'Cell membrane panels');
  for (let index = 1; index <= 6; index += 1) {
    const place = await navigateToVisibleAction(
      page,
      /Place Cell membrane panels/i,
      /Valid Cell membrane panels location/i,
    );
    await place.click();
    await expect(page.getByText(`MEMBRANE ${index}/6`, { exact: true })).toBeVisible();
  }
  const inspectMembrane = await navigateToVisibleAction(
    page,
    /Inspect Cell membrane panels function/i,
    /Inner cell membrane.*inspect/i,
  );
  await inspectMembrane.click();

  const activateCytoplasm = await navigateToVisibleAction(
    page,
    /Activate the full Cytoplasm model fill/i,
    /Cytoplasm control.*activate/i,
  );
  await activateCytoplasm.click();
  const inspectCytoplasm = await navigateToVisibleAction(
    page,
    /Inspect the Cytoplasm function/i,
    /Cytoplasm full-height fill.*inspect/i,
  );
  await inspectCytoplasm.click();
  await expect(page.getByText('FUNCTIONS 3/8', { exact: true })).toBeVisible();
  markStage('boundary-and-cytoplasm');

  const structures: Array<[string, 'left' | 'right']> = [
    ['Nucleus', 'left'],
    ['Ribosomes', 'right'],
    ['Mitochondria', 'left'],
    ['Chloroplasts', 'right'],
    ['Large central vacuole', 'right'],
  ];
  for (const [label, detour] of structures) {
    await mineAndCollectVisibleSupply(page, label, detour);
    await placeAndInspectVisibleStructure(page, label, detour);
    const completed = structures.findIndex(([candidate]) => candidate === label) + 1;
    await expect(
      page.getByText(`INTERIOR COMPONENTS ${completed}/5`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(`FUNCTIONS ${completed + 3}/8`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('CHECKPOINT GRADE 80/100', { exact: true })).toBeVisible();
  markStage('internal-structures');

  const beginDrought = await navigateToVisibleAction(
    page,
    /Begin the reduced water availability challenge/i,
    /Water availability station.*begin challenge/i,
  );
  await beginDrought.click();
  await page.getByRole('button', { name: 'OVERVIEW' }).click();
  await expect(
    page.getByText(/Less turgor pressure.*shrunken vacuole.*wilted plant/i),
  ).toBeVisible();
  await page.getByRole('button', { name: 'CLOSE VIEW' }).click();

  const restoreWater = await navigateToVisibleAction(
    page,
    /Restore external water availability/i,
    /Water availability station.*restore water/i,
  );
  await restoreWater.click();
  await page.getByRole('button', { name: 'OVERVIEW' }).click();
  await expect(
    page.getByText(/Turgor pressure restored.*refilled vacuole.*firm plant again/i),
  ).toBeVisible();
  await page.getByRole('button', { name: 'CLOSE VIEW' }).click();
  markStage('drought-and-recovery');

  const visibleTimer = (
    await page
      .locator('.voxel-classroom-timer')
      .getByText(/^\d+:\d{2} LEFT$/)
      .textContent()
  )?.trim();
  expect(visibleTimer).toMatch(/^\d+:\d{2} LEFT$/);
  const [remainingMinutes, remainingSeconds] = (visibleTimer ?? '0:00 LEFT')
    .replace(' LEFT', '')
    .split(':')
    .map(Number);
  const remainingActiveSeconds = remainingMinutes * 60 + remainingSeconds;
  expect(remainingActiveSeconds).toBeGreaterThan(0);
  expect(remainingActiveSeconds).toBeLessThan(15 * 60);
  await page.getByRole('button', { name: 'Submit the final graded result' }).click();
  await expect(page.getByRole('heading', { name: 'Stable cell achieved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
  await expect(page.getByText('Saved on this iPad')).toBeVisible();
  for (const score of ['15 / 15', '30 / 30', '20 / 20', '5 / 5']) {
    await expect(page.getByText(score, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(/Active time ended|Early result saved/)).toHaveCount(0);
  await page.waitForTimeout(1_000);
  markStage('results');

  await testInfo.attach('release-stage-timings.json', {
    body: Buffer.from(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          browser: browserName,
          project: testInfo.project.name,
          totalMs: Date.now() - routeStartedAt,
          stages: stageTimings,
        },
        null,
        2,
      )}\n`,
    ),
    contentType: 'application/json',
  });

  await assertAndStopReleaseContextLossObserver(page);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await page.close({ runBeforeUnload: false });
});
