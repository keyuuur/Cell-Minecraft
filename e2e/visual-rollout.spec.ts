import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';

type ControlProfile = 'touch-only' | 'keyboard-touch';

interface Point2 {
  x: number;
  z: number;
}

interface ScreenshotEvidence {
  panel: number;
  filename: string;
  sha256: string;
}

interface SubmissionProbe {
  attemptId: string;
  isTest: boolean;
  completed: boolean;
  total: number;
}

interface SubmissionReceiptProbe {
  status: string;
  matchesRequest: boolean;
}

const runId = process.env.VISUAL_RUN_ID;
const visualPass = process.env.VISUAL_PASS ?? 'baseline';
const controlProfile = (process.env.VISUAL_CONTROL_PROFILE ?? 'touch-only') as ControlProfile;
const viewportWidth = Number(process.env.VISUAL_VIEWPORT_WIDTH ?? 1024);
const viewportHeight = Number(process.env.VISUAL_VIEWPORT_HEIGHT ?? 768);
const liveSubmission = process.env.VISUAL_LIVE === 'true';
const outputDir = path.resolve(
  process.env.VISUAL_OUTPUT_DIR ??
    path.join('output', 'playwright', 'ui-rollout-2026-07-14', '00-baseline', 'run-01'),
);
const appBaseSha =
  process.env.VISUAL_APP_BASE_SHA ??
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const evidenceSha = process.env.VISUAL_EVIDENCE_SHA ?? 'working-tree';
const runNumber = Number(runId);
const isCountedRun = Number.isInteger(runNumber) && runNumber > 0;
const defaultYaw = 2.16;
const recenterPosition: Point2 = { x: -18, z: 10 };

if (isCountedRun) {
  if (!/^[0-9a-f]{40}$/i.test(evidenceSha)) {
    throw new Error('Counted runs require a full committed VISUAL_EVIDENCE_SHA.');
  }
  try {
    execFileSync('git', ['cat-file', '-e', `${evidenceSha}^{commit}`]);
    execFileSync('git', ['merge-base', '--is-ancestor', evidenceSha, 'HEAD']);
    execFileSync('git', ['diff', '--quiet', evidenceSha, '--', 'e2e/visual-rollout.spec.ts']);
  } catch {
    throw new Error(
      'Counted runs require the current visual driver to match an ancestor evidence commit.',
    );
  }
}

const structureLabels = {
  cellWall: 'Cell wall panels',
  cellMembrane: 'Cell membrane panels',
  cytoplasm: 'Cytoplasm',
  nucleus: 'Nucleus',
  ribosomes: 'Ribosomes',
  mitochondria: 'Mitochondria',
  chloroplasts: 'Chloroplasts',
  centralVacuole: 'Large central vacuole',
} as const;

const stations: Record<string, Point2> = {
  cellWall: { x: -15, z: 8 },
  cellMembrane: { x: -15, z: 1 },
  cytoplasm: { x: -15, z: -7 },
  nucleus: { x: 15, z: 9 },
  ribosomes: { x: 15, z: 5 },
  mitochondria: { x: 15, z: 1 },
  chloroplasts: { x: 15, z: -3 },
  centralVacuole: { x: 15, z: -7 },
  waterStation: { x: 0, z: -17 },
};

const placements: Record<string, Point2> = {
  cellWall: { x: 0, z: 10.5 },
  cellMembrane: { x: 0, z: 9 },
  cytoplasm: { x: 0, z: 7 },
  nucleus: { x: -6, z: 0 },
  ribosomes: { x: -2, z: 6 },
  mitochondria: { x: 6, z: 4 },
  chloroplasts: { x: 6, z: -4 },
  centralVacuole: { x: 0, z: 0 },
};

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

async function rotateFromRecenter(page: Page, target: Point2): Promise<void> {
  const dx = target.x - recenterPosition.x;
  const dz = target.z - recenterPosition.z;
  const desiredYaw = Math.atan2(dx, dz);
  let remainingPixels = normalizeAngle(desiredYaw - defaultYaw) / 0.0045;
  const canvas = page.locator('canvas.game-canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Game canvas is not visible.');
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height * 0.45;

  while (Math.abs(remainingPixels) > 1) {
    const drag = Math.max(-240, Math.min(240, remainingPixels));
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + drag, centerY, { steps: 4 });
    await page.mouse.up();
    remainingPixels -= drag;
  }
}

async function holdMovement(
  page: Page,
  localX: number,
  localZ: number,
  durationMs: number,
): Promise<void> {
  if (controlProfile === 'keyboard-touch') {
    const canvas = page.locator('canvas.game-canvas');
    await canvas.focus();
    const keys = [
      ...(localZ > 0.2 ? ['w'] : localZ < -0.2 ? ['s'] : []),
      ...(localX > 0.2 ? ['d'] : localX < -0.2 ? ['a'] : []),
    ];
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(durationMs);
    for (const key of keys.reverse()) await page.keyboard.up(key);
    return;
  }

  let remaining = durationMs;
  // Short repeated holds avoid WebKit cancelling a long synthetic pointer capture while still
  // exercising the visible touch-only joystick for the entire route.
  while (remaining > 0) {
    const segment = Math.min(1_400, remaining);
    const joystick = page.locator('.virtual-joystick[aria-label="Movement joystick"]');
    const bounds = await joystick.boundingBox();
    if (!bounds) throw new Error('Movement joystick is not visible.');
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    await expect(joystick).not.toHaveClass(/is-active/);
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    try {
      await expect(joystick).toHaveClass(/is-active/);
      await page.waitForTimeout(140);
      await page.mouse.move(centerX + localX * 42, centerY - localZ * 42, {
        steps: 5,
      });
      await page.waitForTimeout(120);
      await page.waitForTimeout(segment);
      await page.mouse.move(centerX, centerY, { steps: 3 });
    } finally {
      await page.mouse.up();
    }
    await expect(joystick).not.toHaveClass(/is-active/);
    await page.mouse.move(viewportWidth / 2, viewportHeight * 0.45);
    await page.waitForTimeout(500);
    remaining -= segment;
  }
}

async function holdForward(page: Page, durationMs: number): Promise<void> {
  await holdMovement(page, 0, 1, durationMs);
}

async function dragPracticeJoystick(
  joystick: ReturnType<Page['getByLabel']>,
  dx: number,
  dy: number,
): Promise<void> {
  const bounds = await joystick.boundingBox();
  if (!bounds) throw new Error('Practice movement joystick is not visible.');
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const pointerId = Math.round(Math.abs(centerX + centerY + dx + dy));
  // Playwright's touchscreen API supports tap but not drag, and mouse input produces no
  // pointer movement in its iPad-WebKit touch context. Dispatch the complete touch-pointer
  // sequence to the visible joystick; no application state or hidden command is accessed.
  await joystick.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX: centerX,
    clientY: centerY,
  });
  await joystick.dispatchEvent('pointermove', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX: centerX + dx,
    clientY: centerY + dy,
  });
  await joystick.dispatchEvent('pointerup', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX: centerX + dx,
    clientY: centerY + dy,
  });
}

async function moveUntilSemanticLabel(
  page: Page,
  localX: number,
  localZ: number,
  semanticLabel: ReturnType<Page['locator']>,
): Promise<boolean> {
  if (await semanticLabel.isVisible().catch(() => false)) return true;

  if (controlProfile === 'keyboard-touch') {
    const canvas = page.locator('canvas.game-canvas');
    await canvas.focus();
    const keys = [
      ...(localZ > 0.2 ? ['w'] : localZ < -0.2 ? ['s'] : []),
      ...(localX > 0.2 ? ['d'] : localX < -0.2 ? ['a'] : []),
    ];
    for (const key of keys) await page.keyboard.down(key);
    let reached = false;
    try {
      await semanticLabel.waitFor({ state: 'visible', timeout: 2_500 });
      reached = true;
    } catch {
      // The stopped late-frame check below covers the 180 ms semantic throttle.
    } finally {
      for (const key of keys.reverse()) await page.keyboard.up(key);
    }
    if (reached) return true;
    return semanticLabel
      .waitFor({ state: 'visible', timeout: 300 })
      .then(() => true)
      .catch(() => false);
  }

  const joystick = page.locator('.virtual-joystick[aria-label="Movement joystick"]');
  const bounds = await joystick.boundingBox();
  if (!bounds) throw new Error('Movement joystick is not visible.');
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  let reached = false;
  try {
    await expect(joystick).toHaveClass(/is-active/);
    await page.mouse.move(centerX + localX * 42, centerY - localZ * 42, { steps: 3 });
    try {
      await semanticLabel.waitFor({ state: 'visible', timeout: 2_500 });
      reached = true;
    } catch {
      // The stopped late-frame check below covers the 180 ms semantic throttle.
    }
  } finally {
    await page.mouse.up();
  }
  await expect(joystick).not.toHaveClass(/is-active/);
  await page.mouse.move(viewportWidth / 2, viewportHeight * 0.45);
  if (reached) return true;
  return semanticLabel
    .waitFor({ state: 'visible', timeout: 300 })
    .then(() => true)
    .catch(() => false);
}

async function navigateFromRecenter(page: Page, target: Point2, expected: RegExp): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await clickRecenter(page);
    await page.waitForTimeout(120);
    await rotateFromRecenter(page, target);
    const semanticLabel = page.locator('.nearby-label').filter({ hasText: expected });
    // Bounded joystick holds are independent of render FPS and continuously poll the same
    // visible HUD signal a student uses. One full recenter retry is allowed.
    for (let segment = 0; segment < 8; segment += 1) {
      if (await moveUntilSemanticLabel(page, 0, 1, semanticLabel)) return;
    }
  }
  throw new Error(`Navigation did not reach expected semantic target: ${expected}`);
}

async function nudgeForwardUntil(page: Page, expected: RegExp, attempts = 8): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (
      await page
        .getByText(expected)
        .first()
        .isVisible()
        .catch(() => false)
    )
      return;
    await holdForward(page, 70);
    await page.waitForTimeout(220);
  }
  if (
    await page
      .getByText(expected)
      .first()
      .isVisible()
      .catch(() => false)
  )
    return;
  throw new Error(`Forward correction did not reach expected semantic target: ${expected}`);
}

async function completeControlPractice(page: Page): Promise<void> {
  const arena = page.getByLabel('Untimed control practice arena');
  if (controlProfile === 'touch-only') {
    await activateVisibleControl(
      page,
      page.getByRole('radio', { name: /Touch Only/ }),
      'Touch Only profile',
    );
    const joystick = page.getByLabel('Practice movement joystick');
    await dragPracticeJoystick(joystick, 50, -16);
  } else {
    await activateVisibleControl(
      page,
      page.getByRole('radio', { name: /Keyboard \+ Touch/ }),
      'Keyboard + Touch profile',
    );
    await arena.focus();
    await page.keyboard.press('d');
    await page.keyboard.press('d');
    await page.keyboard.press('d');
    await page.keyboard.press('w');
  }

  await page.waitForTimeout(300);
  await tapVisibleButton(page, 'Interact');
  await expect(
    page.getByText('Cube collected. Move into the Target zone and place it.'),
  ).toBeVisible();
  if (controlProfile === 'touch-only') {
    const joystick = page.getByLabel('Practice movement joystick');
    await dragPracticeJoystick(joystick, 82, -80);
  } else {
    await arena.focus();
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('d');
      await page.keyboard.press('w');
    }
  }
  await page.waitForTimeout(300);
  await tapVisibleButton(page, 'Place');
  await expect(
    page.getByText('Placement worked. Practice looking, then recenter the view.'),
  ).toBeVisible();
  const look = page.getByLabel('Drag here to practice looking');
  const box = await look.boundingBox();
  if (!box) throw new Error('Look practice target was not visible.');
  await page.mouse.move(box.x + 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 44, box.y + box.height / 2);
  await page.mouse.up();
  await tapVisibleButton(page, 'Recenter');
  await expect(page.getByRole('button', { name: 'Start mission and timer' })).toBeEnabled();
}

async function capture(
  page: Page,
  screenshots: ScreenshotEvidence[],
  panel: number,
  slug: string,
  fullPage = false,
): Promise<void> {
  await page.waitForTimeout(420);
  const filename = `${String(panel).padStart(2, '0')}-${slug}.png`;
  const destination = path.join(outputDir, filename);
  const buffer = await page.screenshot({ path: destination, fullPage });
  screenshots.push({
    panel,
    filename,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  });
}

async function assertGraphicsHealthy(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Graphics paused safely' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'The 3D scene paused safely' })).toHaveCount(0);
  const liveContext = await page.locator('canvas.game-canvas').evaluate((canvas) => {
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return context !== null && !context.isContextLost();
  });
  expect(liveContext, 'live WebGL context').toBe(true);
}

async function readVisibleGrade(page: Page): Promise<number> {
  const text = (await page.getByRole('button', { name: /Grade \d+%/ }).textContent()) ?? '';
  const match = text.match(/(\d+)%/);
  if (!match) throw new Error(`Could not read visible numerical grade from: ${text}`);
  return Number(match[1]);
}

async function activateVisibleControl(
  page: Page,
  control: Locator,
  label: string,
  forceMouse = false,
): Promise<void> {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  await control.scrollIntoViewIfNeeded();
  const bounds = await control.boundingBox();
  if (!bounds) throw new Error(`${label} control has no visible bounds.`);
  const centerIsControl = await control.evaluate(
    (element, { x, y }) => element.contains(document.elementFromPoint(x, y)),
    { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
  );
  expect(centerIsControl, `${label} center is the visible hit target`).toBe(true);
  if (controlProfile === 'touch-only' && !forceMouse) {
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  } else if (forceMouse) {
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  } else {
    await control.click();
  }
}

async function clickVisibleButton(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true });
  await activateVisibleControl(page, button, name, true);
}

async function tapVisibleButton(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true });
  await activateVisibleControl(page, button, name);
}

async function clickRecenter(page: Page): Promise<void> {
  await activateVisibleControl(
    page,
    page.getByRole('button', { name: 'Recenter', exact: true }),
    'Recenter',
    true,
  );
}

async function collectFromDepot(page: Page, id: keyof typeof structureLabels): Promise<void> {
  const label = structureLabels[id];
  if (id === 'cellWall') {
    await expect(page.getByText(`Nearby: ${label}`)).toBeVisible();
  } else {
    await navigateFromRecenter(page, stations[id], new RegExp(`Nearby:\\s*${label}`, 'i'));
  }
  await clickVisibleButton(page, 'Interact');
  await expect(page.locator('.feedback-toast')).toContainText(
    id === 'cytoplasm' ? 'Cytoplasm now fills' : 'Collected',
  );
  if (id === 'cytoplasm') {
    await expect(page.getByText('Established: Cytoplasm')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place' })).not.toHaveClass(/action-primary/);
    await expect(page.getByRole('button', { name: 'Interact' })).not.toHaveClass(/action-primary/);
    await expect(page.locator('.action-cluster .action-primary')).toHaveCount(0);
  } else {
    await expect(page.getByText(`Selected: ${label}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place' })).toHaveClass(/action-primary/);
    await expect(page.getByRole('button', { name: 'Interact' })).not.toHaveClass(/action-primary/);
    await expect(page.locator('.action-cluster .action-primary')).toHaveCount(1);
  }
}

async function inspectStructure(
  page: Page,
  id: keyof typeof structureLabels,
  expectedFunctionPercent: RegExp,
): Promise<void> {
  const label = structureLabels[id];
  await expect(page.getByText(`Inspect: ${label}`)).toBeVisible();
  await clickVisibleButton(page, 'Interact');
  await expect(page.locator('.feedback-toast')).toContainText('function observed');
  await expect(page.getByLabel('Cell status')).toContainText(expectedFunctionPercent);
  await expect(page.getByText(`Observed: ${label}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Interact' })).not.toHaveClass(/action-primary/);
  await expect(page.locator('.action-cluster .action-primary')).toHaveCount(0);
}

async function selectVisibleHotbarItem(page: Page, label: string): Promise<void> {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  await activateVisibleControl(page, button, label, true);
  await expect(button).toHaveClass(/is-selected/);
}

async function placeCentralVacuole(page: Page): Promise<void> {
  const feedback = page.locator('.feedback-toast');
  await clickRecenter(page);
  await page.waitForTimeout(120);
  // Recenter's locked heading already crosses the broad central zone. Keeping that heading avoids
  // small drag-look variance while the visible Place feedback determines when to stop.
  for (let attempt = 0; attempt < 22; attempt += 1) {
    await clickVisibleButton(page, 'Place');
    await page.waitForTimeout(300);
    const message = (await feedback.textContent()) ?? '';
    if (/installed|Water storage is established/i.test(message)) return;
    if (!/broad central zone/i.test(message)) {
      throw new Error(`Unexpected vacuole placement feedback: ${message}`);
    }
    // Move toward the center in short visible-control steps. The game's placement feedback is
    // the sole signal for when the broad zone has been reached.
    await holdForward(page, 60);
    await page.waitForTimeout(180);
  }
  throw new Error('Visible placement retries did not reach the vacuole central zone.');
}

async function placeBoundaryPanels(page: Page, id: 'cellWall' | 'cellMembrane'): Promise<void> {
  const feedback = page.locator('.feedback-toast');
  const successPattern = id === 'cellWall' ? /Wall panel snapped/i : /Membrane panel snapped/i;
  const correctionPattern =
    id === 'cellWall' ? /Move to the chamber boundary/i : /Move to the inside boundary/i;
  await clickRecenter(page);
  await page.waitForTimeout(120);
  await rotateFromRecenter(page, placements[id]);

  let placed = 0;
  for (let attempt = 0; attempt < 16 && placed === 0; attempt += 1) {
    await clickVisibleButton(page, 'Place');
    await page.waitForTimeout(260);
    const message = (await feedback.textContent()) ?? '';
    if (successPattern.test(message)) {
      placed = 1;
      break;
    }
    if (!correctionPattern.test(message)) {
      throw new Error(`Unexpected boundary placement feedback: ${message}`);
    }
    // A long visible joystick hold remains reliable when software WebKit renders slowly;
    // at normal frame rates it moves from recenter directly into the broad boundary band.
    await holdForward(page, 1_500);
  }
  if (placed === 0) throw new Error(`Visible placement retries did not reach the ${id} zone.`);

  while (placed < 6) {
    await clickVisibleButton(page, 'Place');
    placed += 1;
  }
}

test.describe('real-control visual rollout evidence', () => {
  test.skip(!runId, 'Set VISUAL_RUN_ID to execute a counted visual rollout run.');

  test(`Run ${runId ?? 'unset'} reaches a stable cell using only visible controls`, async ({
    page,
  }) => {
    test.setTimeout(720_000);
    await mkdir(outputDir, { recursive: true });
    await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(15_000);

    const startedAt = new Date();
    const screenshots: ScreenshotEvidence[] = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    let submissionCallCount = 0;
    let submissionProbe: SubmissionProbe | null = null;
    let favicon404Seen = false;
    let graphicsContextChecks = 0;
    const semanticAssertions: string[] = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() === 404 && new URL(response.url()).pathname === '/favicon.ico') {
        favicon404Seen = true;
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', (request) => {
      if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/submit') return;
      const body = request.postDataJSON() as {
        attemptId?: unknown;
        isTest?: unknown;
        completed?: unknown;
        score?: { total?: unknown };
      };
      submissionCallCount += 1;
      submissionProbe = {
        attemptId: typeof body.attemptId === 'string' ? body.attemptId : '',
        isTest: body.isTest === true,
        completed: body.completed === true,
        total: typeof body.score?.total === 'number' ? body.score.total : Number.NaN,
      };
    });

    if (!liveSubmission) {
      await page.route('**/api/submit', async (route) => {
        const body = route.request().postDataJSON() as { attemptId: string };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            attemptId: body.attemptId,
            status: 'accepted',
            serverTimestamp: new Date().toISOString(),
          }),
        });
      });
    }

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Build a Living Cell' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Advance test stage' })).toHaveCount(0);
    await expect(page.getByText(/TEST MODE/)).toHaveCount(0);
    semanticAssertions.push('production-shaped UI contains no test tools');
    await capture(page, screenshots, 1, 'identify-blank', true);

    await page.getByLabel('First name').fill('Test');
    await page.getByLabel('Last initial').fill('S');
    await page.getByLabel('Class period').selectOption('1');
    await tapVisibleButton(page, 'Continue to controls');
    await completeControlPractice(page);
    await page.getByRole('button', { name: 'Start mission and timer' }).scrollIntoViewIfNeeded();
    await capture(page, screenshots, 2, 'controls-practice-complete', true);
    const missionStartClickedAt = Date.now();
    await clickVisibleButton(page, 'Start mission and timer');
    await expect(page.getByLabel('Mission controls')).toBeVisible();
    await expect(page.getByLabel('Three-dimensional plant cell construction chamber')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.virtual-joystick[aria-label="Movement joystick"]')).toBeVisible({
      visible: controlProfile === 'touch-only',
      timeout: 1_000,
    });
    const missionReadyMs = Date.now() - missionStartClickedAt;
    expect(missionReadyMs, 'mission becomes interactive within ten seconds').toBeLessThanOrEqual(
      10_000,
    );
    await assertGraphicsHealthy(page);
    graphicsContextChecks += 1;
    await clickVisibleButton(page, 'Pause');
    await expect(page.getByRole('dialog', { name: 'Mission paused' })).toBeVisible();
    const timerWhilePaused = await page.locator('.timer-card strong').textContent();
    await page.waitForTimeout(1_200);
    await expect(page.locator('.timer-card strong')).toHaveText(timerWhilePaused ?? '15:00');
    await clickVisibleButton(page, 'Resume mission');
    await expect(page.getByRole('dialog', { name: 'Mission paused' })).toHaveCount(0);
    semanticAssertions.push('visible Pause and Resume held the active timer');

    await navigateFromRecenter(page, stations.cellWall, /Nearby:\s*Cell wall panels/i);
    await capture(page, screenshots, 3, 'mission-opening');

    await collectFromDepot(page, 'cellWall');
    await placeBoundaryPanels(page, 'cellWall');
    await expect(page.locator('.feedback-toast')).toContainText('Wall complete');
    await page.waitForTimeout(360);
    await nudgeForwardUntil(page, /Inspect:\s*Cell wall panels/i, 10);
    await inspectStructure(page, 'cellWall', /13%/);

    await collectFromDepot(page, 'cellMembrane');
    await placeBoundaryPanels(page, 'cellMembrane');
    await expect(page.locator('.feedback-toast')).toContainText('Boundary complete');
    await page.waitForTimeout(360);
    await nudgeForwardUntil(page, /Inspect:\s*Cell membrane panels/i);
    await inspectStructure(page, 'cellMembrane', /25%/);

    await collectFromDepot(page, 'cytoplasm');
    await navigateFromRecenter(page, placements.cytoplasm, /Inspect:\s*Cytoplasm/i);
    await inspectStructure(page, 'cytoplasm', /38%/);
    await capture(page, screenshots, 4, 'boundary-and-cytoplasm');

    for (const [id, functionPercent] of [
      ['nucleus', /50%/],
      ['ribosomes', /63%/],
    ] as const) {
      await collectFromDepot(page, id);
      await navigateFromRecenter(page, placements[id], /Observed:\s*Cytoplasm/i);
      await clickVisibleButton(page, 'Place');
      await expect(page.locator('.feedback-toast')).toContainText('installed');
      await page.waitForTimeout(360);
      await inspectStructure(page, id, functionPercent);
      if (id === 'nucleus') {
        const gradeBeforeRemoval = await readVisibleGrade(page);
        await selectVisibleHotbarItem(page, 'Nucleus');
        await clickVisibleButton(page, 'Remove selected');
        await expect(page.locator('.feedback-toast')).toContainText(
          'Replace it to restore full credit',
        );
        await expect(page.getByLabel('Cell status')).toContainText('38%');
        const gradeAfterRemoval = await readVisibleGrade(page);
        expect(gradeAfterRemoval, 'grade drops after visible removal').toBeLessThan(
          gradeBeforeRemoval,
        );
        await selectVisibleHotbarItem(page, 'Nucleus');
        await clickVisibleButton(page, 'Place');
        await expect(page.locator('.feedback-toast')).toContainText('installed');
        await page.waitForTimeout(360);
        await inspectStructure(page, 'nucleus', /50%/);
        const gradeAfterRestore = await readVisibleGrade(page);
        expect(gradeAfterRestore, 'full grade restored after replace and reinspect').toBe(
          gradeBeforeRemoval,
        );
        semanticAssertions.push('visible Remove, replace, and reinspect restored full credit');
      }
    }
    await capture(page, screenshots, 5, 'nucleus-and-ribosomes');

    for (const [id, functionPercent] of [
      ['mitochondria', /75%/],
      ['chloroplasts', /88%/],
    ] as const) {
      await collectFromDepot(page, id);
      await navigateFromRecenter(page, placements[id], /Observed:\s*Cytoplasm/i);
      await clickVisibleButton(page, 'Place');
      await expect(page.locator('.feedback-toast')).toContainText('installed');
      await page.waitForTimeout(360);
      await inspectStructure(page, id, functionPercent);
    }
    await capture(page, screenshots, 6, 'mitochondria-and-chloroplasts');

    await collectFromDepot(page, 'centralVacuole');
    await placeCentralVacuole(page);
    await page.waitForTimeout(360);
    await expect(page.getByText('Inspect: Large central vacuole')).toBeVisible();
    await capture(page, screenshots, 7, 'function-inspect-before');
    await inspectStructure(page, 'centralVacuole', /100%/);
    await capture(page, screenshots, 7, 'function-interact-after');
    semanticAssertions.push(
      'all eight function evidence events earned through Inspect and Interact',
    );

    await clickVisibleButton(page, 'Overview');
    await expect(page.getByRole('dialog', { name: 'Cell overview' })).toBeVisible();
    await expect(page.getByText('100% recorded')).toBeVisible();
    await expect(page.getByText('100% pressure')).toBeVisible();
    await expect(page.getByText(/Baseline: the vacuole is full/)).toBeVisible();
    await capture(page, screenshots, 8, 'hydrated-overview', true);
    await clickVisibleButton(page, 'Begin water-availability challenge');

    await clickVisibleButton(page, 'Overview');
    await expect(page.getByText('25% pressure')).toBeVisible();
    await expect(page.getByText(/central vacuole is shrinking/)).toBeVisible();
    await capture(page, screenshots, 9, 'drought-wilt-overview', true);
    await clickVisibleButton(page, 'Close overview');

    await navigateFromRecenter(page, stations.waterStation, /Nearby:\s*Water station/i);
    await clickVisibleButton(page, 'Interact');
    await expect(page.locator('.feedback-toast')).toContainText('Water availability is restored');
    await clickVisibleButton(page, 'Overview');
    await expect(page.getByText('100% pressure')).toBeVisible();
    await expect(page.locator('.system-success')).toContainText('plant is firm again');
    await capture(page, screenshots, 10, 'recovered-overview', true);
    await clickVisibleButton(page, 'Close overview');

    await expect(page.getByText(/Cell stable/)).toBeVisible();
    await assertGraphicsHealthy(page);
    graphicsContextChecks += 1;
    const receiptResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.pathname === '/api/submit';
    });
    await clickVisibleButton(page, 'Submit final result');
    const receiptResponse = await receiptResponsePromise;
    expect(receiptResponse.ok(), 'successful submission response').toBe(true);
    const receiptBody = (await receiptResponse.json()) as {
      attemptId?: unknown;
      status?: unknown;
    };
    const submissionReceipt: SubmissionReceiptProbe = {
      status: typeof receiptBody.status === 'string' ? receiptBody.status : '',
      matchesRequest:
        typeof receiptBody.attemptId === 'string' &&
        receiptBody.attemptId.length > 0 &&
        receiptBody.attemptId === submissionProbe?.attemptId,
    };
    await expect(page.getByText('Stable cell achieved')).toBeVisible();
    await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
    await expect(page.getByText('Result delivered successfully.')).toBeVisible();
    await capture(page, screenshots, 11, 'results-delivered', true);
    semanticAssertions.push('drought observed, external water restored, recovery verified at 100%');

    const allowedConsoleErrors = favicon404Seen
      ? consoleErrors.filter((message) => /404 \(Not Found\)/i.test(message)).slice(0, 1)
      : [];
    const unallowedConsoleErrors = consoleErrors.filter(
      (message) => !allowedConsoleErrors.includes(message),
    );
    expect(pageErrors, 'page errors').toEqual([]);
    expect(unallowedConsoleErrors, 'unallowlisted console errors').toEqual([]);
    expect(screenshots).toHaveLength(12);
    expect(submissionCallCount, 'submission request count').toBe(1);
    expect(submissionProbe?.attemptId, 'nonempty transient attempt ID').toBeTruthy();
    expect(submissionProbe?.completed, 'completed submission').toBe(true);
    expect(submissionProbe?.total, 'submitted score').toBe(100);
    if (liveSubmission) expect(submissionProbe?.isTest, 'Preview test flag').toBe(true);
    expect(submissionReceipt?.status, 'accepted receipt status').toBe('accepted');
    expect(submissionReceipt?.matchesRequest, 'receipt matches transient attempt ID').toBe(true);
    await page.waitForTimeout(1_000);
    expect(submissionCallCount, 'submission request remains exactly one').toBe(1);

    const finishedAt = new Date();
    const manifest = {
      schemaVersion: 1,
      countedRun: isCountedRun ? runNumber : null,
      calibration: !isCountedRun,
      visualPass,
      appBaseSha,
      evidenceSha,
      target: liveSubmission ? 'protected-preview-emulation' : 'local-emulation',
      engine: `${test.info().project.name} browser emulation`,
      physicalDeviceEvidence: false,
      viewport: { width: viewportWidth, height: viewportHeight },
      missionReadyMs,
      controls: controlProfile,
      accessibility: {
        largeText: process.env.VISUAL_LARGE_TEXT === 'true',
        highContrast: process.env.VISUAL_HIGH_CONTRAST === 'true',
        reducedMotion: process.env.VISUAL_REDUCED_MOTION === 'true',
        mute: process.env.VISUAL_MUTE === 'true',
      },
      startedAtUtc: startedAt.toISOString(),
      finishedAtUtc: finishedAt.toISOString(),
      semanticAssertions,
      screenshots,
      pageErrors,
      consoleErrors: unallowedConsoleErrors,
      allowedConsoleErrors,
      submissionMode: liveSubmission ? 'preview-forced-test' : 'intercepted-synthetic',
      submissionOutcome: submissionReceipt.status,
      submissionCallCount,
      graphicsContextGate: { status: 'passed', checks: graphicsContextChecks },
      outcome: 'success',
    };
    await writeFile(
      path.join(outputDir, 'run.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
  });
});
