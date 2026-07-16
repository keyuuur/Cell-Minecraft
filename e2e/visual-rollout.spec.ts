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

interface DiagnosticEvidence {
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
  serverTimestamp: string;
}

const runId = process.env.VISUAL_RUN_ID;
const visualPass = process.env.VISUAL_PASS ?? 'baseline';
const externalBaseURL = process.env.E2E_BASE_URL;
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
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
const forceReloadRecovery = process.env.VISUAL_FORCE_RELOAD === 'true';
const accessibilityAudit =
  process.env.VISUAL_LARGE_TEXT === 'true' &&
  process.env.VISUAL_HIGH_CONTRAST === 'true' &&
  process.env.VISUAL_REDUCED_MOTION === 'true' &&
  process.env.VISUAL_MUTE === 'true';
const pass3Diagnostics = visualPass === 'visual-pass-3';
const defaultYaw = 2.16;
const recenterPosition: Point2 = { x: -18, z: 10 };

async function authorizeProtectedPreview(page: Page): Promise<void> {
  if (!liveSubmission) return;
  if (!externalBaseURL || !vercelBypassSecret) {
    throw new Error(
      'Live visual evidence requires E2E_BASE_URL and VERCEL_AUTOMATION_BYPASS_SECRET.',
    );
  }

  const bootstrap = await page.context().request.get(externalBaseURL, {
    headers: {
      'x-vercel-protection-bypass': vercelBypassSecret,
      'x-vercel-set-bypass-cookie': 'true',
    },
    maxRedirects: 0,
  });
  const receivedBypassCookie = Boolean(bootstrap.headers()['set-cookie']);
  await bootstrap.dispose();
  if (!receivedBypassCookie) {
    throw new Error('Vercel did not return the expected automation-bypass cookie.');
  }

  const cookies = await page.context().cookies(externalBaseURL);
  if (cookies.length === 0) {
    throw new Error(
      'The protected Preview bypass cookie was not installed in the browser context.',
    );
  }
}

if (isCountedRun) {
  if (!/^[0-9a-f]{40}$/i.test(evidenceSha)) {
    throw new Error('Counted runs require a full committed VISUAL_EVIDENCE_SHA.');
  }
  if (!/^[0-9a-f]{40}$/i.test(appBaseSha)) {
    throw new Error('Counted runs require a full committed VISUAL_APP_BASE_SHA.');
  }
  try {
    execFileSync('git', ['cat-file', '-e', `${evidenceSha}^{commit}`]);
    execFileSync('git', ['cat-file', '-e', `${appBaseSha}^{commit}`]);
    execFileSync('git', ['merge-base', '--is-ancestor', evidenceSha, 'HEAD']);
    execFileSync('git', ['merge-base', '--is-ancestor', evidenceSha, appBaseSha]);
    execFileSync('git', [
      'diff',
      '--quiet',
      evidenceSha,
      '--',
      'e2e/visual-rollout.spec.ts',
      'playwright.config.ts',
    ]);
  } catch {
    throw new Error(
      'Counted runs require committed app/evidence SHAs and an unchanged ancestor visual harness.',
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

const functionEvidenceText = {
  cellWall: 'supports the plant cell',
  cellMembrane: 'controls what enters and leaves',
  cytoplasm: 'gelatin-like material',
  nucleus: 'contains DNA and helps control cell activities',
  ribosomes: 'make proteins',
  mitochondria: 'break down glucose to release usable energy',
  chloroplasts: 'Photosynthesis occurs in chloroplasts',
  centralVacuole: 'stores water and helps maintain turgor pressure',
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

async function captureDiagnostic(
  page: Page,
  diagnostics: DiagnosticEvidence[],
  slug: string,
): Promise<void> {
  await page.waitForTimeout(420);
  const filename = `diagnostic-${slug}.png`;
  const destination = path.join(outputDir, filename);
  const buffer = await page.screenshot({ path: destination });
  diagnostics.push({
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

async function readActiveSecondsRemaining(page: Page): Promise<number> {
  const text = (await page.locator('.timer-card strong').textContent()) ?? '';
  const match = text.match(/(\d+):(\d+)/);
  if (!match) throw new Error(`Could not read the visible active timer from: ${text}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

async function applyAccessibilityProfile(page: Page): Promise<void> {
  const settings = [
    ['VISUAL_LARGE_TEXT', 'Large text'],
    ['VISUAL_HIGH_CONTRAST', 'High contrast'],
    ['VISUAL_REDUCED_MOTION', 'Reduced motion'],
    ['VISUAL_MUTE', 'Mute sounds'],
  ] as const;
  for (const [environmentName, label] of settings) {
    if (process.env[environmentName] !== 'true') continue;
    const checkbox = page.getByRole('checkbox', { name: label });
    if (!(await checkbox.isChecked())) await activateVisibleControl(page, checkbox, label);
  }
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
  const button = actionButton(page, name);
  await activateVisibleControl(page, button, name);
}

async function tapVisibleButton(page: Page, name: string): Promise<void> {
  const button = actionButton(page, name);
  await activateVisibleControl(page, button, name);
}

function actionButton(page: Page, name: string): Locator {
  if (name === 'Interact') {
    return page
      .getByRole('button', {
        name: /^(?:Interact|Collect .+|Inspect .+|Establish Cytoplasm|Restore water availability)$/,
      })
      .first();
  }
  if (name === 'Place') return page.getByRole('button', { name: /^Place(?: .+)?$/ }).first();
  if (name === 'Remove selected') {
    return page.getByRole('button', { name: /^Remove(?: selected| .+)?$/ }).first();
  }
  return page.getByRole('button', { name, exact: true });
}

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

async function assertCriticalTouchLayout(page: Page): Promise<void> {
  const joystick = page.getByLabel('Movement joystick');
  const joystickBounds = await joystick.boundingBox();
  if (!joystickBounds) throw new Error('Touch-only joystick was not visible.');

  const controls = page.locator(
    '.hud-top button:visible, .utility-cluster button:visible, .action-cluster button:visible, .hotbar button.is-selected:visible',
  );
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    const bounds = await control.boundingBox();
    if (!bounds) throw new Error(`Visible touch control ${index + 1} had no bounds.`);
    expect(bounds.width, `touch control ${index + 1} width`).toBeGreaterThanOrEqual(56);
    expect(bounds.height, `touch control ${index + 1} height`).toBeGreaterThanOrEqual(56);
    expect(overlaps(joystickBounds, bounds), `touch control ${index + 1} overlaps joystick`).toBe(
      false,
    );
    const centerIsControl = await control.evaluate(
      (element, { x, y }) => element.contains(document.elementFromPoint(x, y)),
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    );
    expect(centerIsControl, `touch control ${index + 1} owns its center hit target`).toBe(true);
  }

  const regions = await Promise.all(
    ['.utility-cluster', '.hotbar', '.action-cluster'].map(async (selector) => {
      const bounds = await page.locator(selector).boundingBox();
      if (!bounds) throw new Error(`Missing HUD region: ${selector}`);
      return { selector, bounds };
    }),
  );
  for (let left = 0; left < regions.length; left += 1) {
    for (let right = left + 1; right < regions.length; right += 1) {
      expect(
        overlaps(regions[left].bounds, regions[right].bounds),
        `${regions[left].selector} overlaps ${regions[right].selector}`,
      ).toBe(false);
    }
  }

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow, 'page horizontal overflow').toBeLessThanOrEqual(1);
}

async function assertHotbarLabelsReadable(page: Page): Promise<void> {
  const labels = page.locator('.hotbar button span');
  for (let index = 0; index < (await labels.count()); index += 1) {
    const label = labels.nth(index);
    const geometry = await label.evaluate((element) => {
      const labelBounds = element.getBoundingClientRect();
      const buttonBounds = element.closest('button')?.getBoundingClientRect();
      return buttonBounds
        ? {
            text: element.textContent?.trim() ?? 'hotbar label',
            left: labelBounds.left >= buttonBounds.left - 1,
            right: labelBounds.right <= buttonBounds.right + 1,
            top: labelBounds.top >= buttonBounds.top - 1,
            bottom: labelBounds.bottom <= buttonBounds.bottom + 1,
          }
        : null;
    });
    if (!geometry) throw new Error(`Hotbar label ${index + 1} was not inside a button.`);
    expect(
      geometry.left && geometry.right && geometry.top && geometry.bottom,
      `${geometry.text} remains fully inside its hotbar button`,
    ).toBe(true);
  }
}

async function assertAccessibleDialog(
  page: Page,
  dialogName: string,
  criticalControlName: string,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: dialogName });
  const dialogBounds = await dialog.boundingBox();
  if (!dialogBounds) throw new Error(`${dialogName} dialog had no visible bounds.`);
  expect(dialogBounds.y).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.y + dialogBounds.height).toBeLessThanOrEqual(viewportHeight);
  const horizontalOverflow = await dialog.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(horizontalOverflow, `${dialogName} horizontal overflow`).toBeLessThanOrEqual(1);
  const controlBounds = await page
    .getByRole('button', { name: criticalControlName, exact: true })
    .boundingBox();
  if (!controlBounds) throw new Error(`${criticalControlName} had no visible bounds.`);
  expect(controlBounds.width).toBeGreaterThanOrEqual(56);
  expect(controlBounds.height).toBeGreaterThanOrEqual(56);
}

async function assertHighContrastPrimaryAction(page: Page): Promise<void> {
  const primary = page.locator('.action-cluster .action-primary');
  await expect(primary).toHaveCount(1);
  const structuralCue = await primary.evaluate((element) => {
    const style = getComputedStyle(element);
    const parseRgb = (value: string) =>
      value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [0, 0, 0];
    const luminance = (rgb: number[]) => {
      const channels = rgb.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const foreground = luminance(parseRgb(style.color));
    const background = luminance(parseRgb(style.backgroundColor));
    const contrastRatio =
      (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    return {
      borderStyle: style.borderTopStyle,
      outlineStyle: style.outlineStyle,
      contrastRatio,
    };
  });
  expect(
    structuralCue.borderStyle === 'double' || structuralCue.outlineStyle !== 'none',
    'high-contrast primary action has a structural cue',
  ).toBe(true);
  expect(
    structuralCue.contrastRatio,
    'high-contrast primary action text contrast',
  ).toBeGreaterThanOrEqual(4.5);
}

async function clickRecenter(page: Page): Promise<void> {
  await activateVisibleControl(
    page,
    page.getByRole('button', { name: 'Recenter', exact: true }),
    'Recenter',
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
    await expect(page.locator('.next-station-cue')).toContainText('Nucleus or Ribosomes');
    await expect(actionButton(page, 'Place')).not.toHaveClass(/action-primary/);
    await expect(actionButton(page, 'Interact')).not.toHaveClass(/action-primary/);
    await expect(page.locator('.action-cluster .action-primary')).toHaveCount(0);
  } else {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveClass(/is-selected/);
    await expect(page.locator('.placement-guide.is-blocked')).toContainText('BLOCKED');
    await expect(actionButton(page, 'Place')).toBeDisabled();
    await expect(actionButton(page, 'Place')).not.toHaveClass(/action-primary/);
    await expect(actionButton(page, 'Interact')).not.toHaveClass(/action-primary/);
    await expect(page.locator('.action-cluster .action-primary')).toHaveCount(0);
  }
}

async function inspectStructure(
  page: Page,
  id: keyof typeof structureLabels,
  expectedFunctionPercent: RegExp,
): Promise<void> {
  const label = structureLabels[id];
  const inspectLabel = page.getByText(`Inspect: ${label}`);
  if (!(await inspectLabel.isVisible().catch(() => false))) {
    await navigateFromRecenter(page, placements[id], new RegExp(`Inspect:\\s*${label}`, 'i'));
  }
  await expect(inspectLabel).toBeVisible();
  await clickVisibleButton(page, 'Interact');
  await expect(page.locator('.feedback-toast')).toContainText('observed');
  await expect(page.locator('.feedback-toast')).toContainText(functionEvidenceText[id]);
  await expect(page.getByLabel('Cell status')).toContainText(expectedFunctionPercent);
  await expect(
    page.getByText(`Observed: ${label}`).or(page.locator('.next-station-cue')),
  ).toBeVisible();
  await expect(actionButton(page, 'Interact')).not.toHaveClass(/action-primary/);
  await expect(page.locator('.action-cluster .action-primary')).toHaveCount(0);
}

async function selectVisibleHotbarItem(page: Page, label: string): Promise<void> {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  await activateVisibleControl(page, button, label);
  await expect(button).toHaveClass(/is-selected/);
}

async function moveUntilPlacementValid(page: Page, attempts: number): Promise<void> {
  const place = actionButton(page, 'Place');
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await place.isEnabled()) {
      await expect(page.locator('.placement-guide.is-valid')).toContainText('VALID ZONE');
      return;
    }
    await holdForward(page, 140);
    await page.waitForTimeout(220);
  }
  throw new Error('Visible movement did not reach a valid placement zone.');
}

async function moveToPlacementZone(
  page: Page,
  target: Point2,
  settleMs = 0,
  attempts = 50,
): Promise<void> {
  await clickRecenter(page);
  await page.waitForTimeout(120);
  await rotateFromRecenter(page, target);
  await moveUntilPlacementValid(page, attempts);
  if (settleMs > 0) {
    await holdForward(page, settleMs);
    await page.waitForTimeout(220);
    await expect(actionButton(page, 'Place')).toBeEnabled();
    await expect(page.locator('.placement-guide.is-valid')).toContainText('VALID ZONE');
  }
}

async function framePlacedStructures(
  page: Page,
  ids: Array<keyof typeof placements>,
): Promise<void> {
  const target = ids.reduce(
    (sum, id) => ({
      x: sum.x + placements[id].x / ids.length,
      z: sum.z + placements[id].z / ids.length,
    }),
    { x: 0, z: 0 },
  );
  await clickRecenter(page);
  await page.waitForTimeout(120);
  await rotateFromRecenter(page, target);
  await holdForward(page, 1_900);
  await page.waitForTimeout(360);
}

async function placeCentralVacuole(page: Page): Promise<void> {
  await clickRecenter(page);
  await page.waitForTimeout(120);
  await rotateFromRecenter(page, placements.centralVacuole);
  await moveUntilPlacementValid(page, 60);
  await clickVisibleButton(page, 'Place');
  await expect(page.locator('.feedback-toast')).toContainText('Water storage is established');
}

async function placeBoundaryPanels(
  page: Page,
  id: 'cellWall' | 'cellMembrane',
  onValid?: () => Promise<void>,
): Promise<void> {
  const successPattern = id === 'cellWall' ? /Wall panel snapped/i : /Membrane panel snapped/i;
  await clickRecenter(page);
  await page.waitForTimeout(120);
  await rotateFromRecenter(page, placements[id]);
  await moveUntilPlacementValid(page, 30);
  await onValid?.();
  await clickVisibleButton(page, 'Place');
  await expect(page.locator('.feedback-toast')).toContainText(successPattern);
  let placed = 1;
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
    const diagnosticScreenshots: DiagnosticEvidence[] = [];
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    let submissionCallCount = 0;
    let submissionProbe: SubmissionProbe | null = null;
    let transientSubmissionPayload: unknown = null;
    let favicon404Seen = false;
    let graphicsContextChecks = 0;
    let graphicsContextLossEvents = 0;
    const semanticAssertions: string[] = [];

    await page.exposeFunction('__recordVisualWebglContextLoss', () => {
      graphicsContextLossEvents += 1;
    });
    await page.addInitScript(() => {
      window.addEventListener(
        'webglcontextlost',
        () => {
          const record = (
            window as Window & { __recordVisualWebglContextLoss?: () => Promise<void> }
          ).__recordVisualWebglContextLoss;
          void record?.();
        },
        true,
      );
    });

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
      transientSubmissionPayload = body;
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

    await authorizeProtectedPreview(page);
    if (liveSubmission) semanticAssertions.push('protected Preview bypass cookie installed');
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
    await applyAccessibilityProfile(page);
    if (accessibilityAudit) {
      for (const label of ['Large text', 'High contrast', 'Reduced motion', 'Mute sounds']) {
        await expect(page.getByRole('checkbox', { name: label })).toBeChecked();
      }
    }
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
    if (accessibilityAudit) {
      const shell = page.getByTestId('app-shell');
      await expect(shell).toHaveClass(/large-text/);
      await expect(shell).toHaveClass(/high-contrast/);
      await expect(shell).toHaveClass(/reduced-motion/);
      await assertCriticalTouchLayout(page);
      const motionDurationsMs = await page
        .locator('.hud-button')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          const toMilliseconds = (value: string) =>
            Number.parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1_000);
          return {
            animation: toMilliseconds(style.animationDuration),
            transition: toMilliseconds(style.transitionDuration),
          };
        });
      expect(motionDurationsMs.animation).toBeLessThanOrEqual(0.01);
      expect(motionDurationsMs.transition).toBeLessThanOrEqual(0.01);
      semanticAssertions.push(
        'touch-only large-text high-contrast reduced-motion mute profile was visibly applied',
        'critical touch controls were at least 56px, center hit-testable, and clear of the joystick',
      );
    }
    const missionReadyMs = Date.now() - missionStartClickedAt;
    expect(missionReadyMs, 'mission becomes interactive within ten seconds').toBeLessThanOrEqual(
      10_000,
    );
    await assertGraphicsHealthy(page);
    graphicsContextChecks += 1;
    await clickVisibleButton(page, 'Pause');
    await expect(page.getByRole('dialog', { name: 'Mission paused' })).toBeVisible();
    if (accessibilityAudit) {
      await assertAccessibleDialog(page, 'Mission paused', 'Resume mission');
      await expect(page.locator('.stuck-prompt')).toHaveCount(0);
    }
    const timerWhilePaused = await page.locator('.timer-card strong').textContent();
    await page.waitForTimeout(1_200);
    await expect(page.locator('.timer-card strong')).toHaveText(timerWhilePaused ?? '15:00');
    await clickVisibleButton(page, 'Resume mission');
    await expect(page.getByRole('dialog', { name: 'Mission paused' })).toHaveCount(0);
    semanticAssertions.push('visible Pause and Resume held the active timer');

    await navigateFromRecenter(page, stations.cellWall, /Nearby:\s*Cell wall panels/i);
    if (accessibilityAudit) {
      await expect(page.getByRole('button', { name: 'Collect Cell wall panels' })).toBeVisible();
      await assertHighContrastPrimaryAction(page);
      semanticAssertions.push(
        'touch-only actions used contextual accessible names and a structural high-contrast primary cue',
      );
    }
    await capture(page, screenshots, 3, 'mission-opening');

    await collectFromDepot(page, 'cellWall');
    await expect(page.getByRole('button', { name: 'Place Cell wall panels' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove Cell wall panels' })).toBeVisible();
    await captureDiagnostic(page, diagnosticScreenshots, 'placement-blocked');
    semanticAssertions.push('blocked placement was shown before movement into the outer wall zone');
    await placeBoundaryPanels(page, 'cellWall', async () => {
      await captureDiagnostic(page, diagnosticScreenshots, 'placement-valid');
    });
    semanticAssertions.push('visible movement corrected the blocked placement and enabled Place');
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

    if (runNumber === 3 || forceReloadRecovery) {
      const objectiveBeforeReload =
        (await page.locator('.objective-card strong').textContent())?.trim() ?? '';
      const gradeBeforeReload = await readVisibleGrade(page);
      await clickVisibleButton(page, 'Pause');
      await expect(page.getByRole('dialog', { name: 'Mission paused' })).toBeVisible();
      await page.waitForTimeout(450);
      const timerBeforeReload = await readActiveSecondsRemaining(page);
      await page.reload();
      await expect(page.getByRole('button', { name: 'Resume saved attempt' })).toBeVisible();
      await page.waitForTimeout(3_500);
      await clickVisibleButton(page, 'Resume saved attempt');
      await expect(page.getByLabel('Mission controls')).toBeVisible();
      await expect(page.locator('.objective-card strong')).toHaveText(objectiveBeforeReload);
      await expect(page.getByLabel('Cell status')).toContainText('38%');
      expect(await readVisibleGrade(page), 'grade returns after reload').toBe(gradeBeforeReload);
      await expect(page.locator('.virtual-joystick[aria-label="Movement joystick"]')).toHaveCount(
        controlProfile === 'keyboard-touch' ? 0 : 1,
      );
      const timerAfterReload = await readActiveSecondsRemaining(page);
      expect(timerAfterReload).toBeLessThanOrEqual(timerBeforeReload);
      expect(timerAfterReload).toBeGreaterThanOrEqual(timerBeforeReload - 1);
      await assertGraphicsHealthy(page);
      graphicsContextChecks += 1;
      if (controlProfile === 'keyboard-touch') {
        await navigateFromRecenter(page, stations.nucleus, /Nearby:\s*Nucleus/i);
        await clickRecenter(page);
      }
      semanticAssertions.push(
        'reload recovery preserved objective, grade, function state, control profile, and inactive time',
      );
      if (controlProfile === 'keyboard-touch') {
        semanticAssertions.push('fresh keyboard movement reached an active depot after reload');
      }
    }

    for (const [id, functionPercent] of [
      ['nucleus', /50%/],
      ['ribosomes', /63%/],
    ] as const) {
      await collectFromDepot(page, id);
      await moveToPlacementZone(page, placements[id], id === 'nucleus' ? 500 : 650);
      await clickVisibleButton(page, 'Place');
      await expect(page.locator('.feedback-toast')).toContainText('installed');
      await page.waitForTimeout(360);
      await inspectStructure(page, id, functionPercent);
      if (id === 'nucleus') {
        const gradeBeforeRemoval = await readVisibleGrade(page);
        await selectVisibleHotbarItem(page, 'Nucleus');
        await clickVisibleButton(page, 'Remove selected');
        await expect(page.locator('.feedback-toast')).toContainText(
          'replace it, then reinspect to restore full credit',
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
    await framePlacedStructures(page, ['nucleus', 'ribosomes']);
    await capture(page, screenshots, 5, 'nucleus-and-ribosomes');

    for (const [id, functionPercent] of [
      ['mitochondria', /75%/],
      ['chloroplasts', /88%/],
    ] as const) {
      await collectFromDepot(page, id);
      await moveToPlacementZone(page, placements[id], id === 'mitochondria' ? 750 : 850);
      await clickVisibleButton(page, 'Place');
      await expect(page.locator('.feedback-toast')).toContainText('installed');
      await page.waitForTimeout(360);
      await inspectStructure(page, id, functionPercent);
    }
    await framePlacedStructures(page, ['mitochondria', 'chloroplasts']);
    await capture(page, screenshots, 6, 'mitochondria-and-chloroplasts');

    await collectFromDepot(page, 'centralVacuole');
    if (accessibilityAudit) {
      await expect(page.getByRole('button', { name: 'Place Large central vacuole' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Remove Large central vacuole' }),
      ).toBeVisible();
      await assertCriticalTouchLayout(page);
      await assertHotbarLabelsReadable(page);
      await assertGraphicsHealthy(page);
      graphicsContextChecks += 1;
      await captureDiagnostic(page, diagnosticScreenshots, 'accessibility-vacuole-actions');
    }
    await placeCentralVacuole(page);
    await holdMovement(page, 0, -1, 450);
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
    if (accessibilityAudit) {
      await assertAccessibleDialog(page, 'Cell overview', 'Close overview');
      await expect(page.locator('.stuck-prompt')).toHaveCount(0);
      semanticAssertions.push(
        'Pause and Overview dialogs fit the viewport, avoided horizontal overflow, and suppressed the stuck prompt',
      );
    }
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
    await expect(page.locator('.feedback-toast')).toContainText('External water is restored');
    await clickVisibleButton(page, 'Overview');
    await expect(page.getByText('100% pressure')).toBeVisible();
    await expect(page.locator('.system-success')).toContainText('plant is firm again');
    await capture(page, screenshots, 10, 'recovered-overview', true);
    await clickVisibleButton(page, 'Close overview');

    await expect(page.getByText(/Cell stable/)).toBeVisible();
    if (pass3Diagnostics) {
      await clickVisibleButton(page, 'Hint');
      await expect(page.getByRole('heading', { name: 'Hint level 1 of 3' })).toBeVisible();
      await clickVisibleButton(page, 'Make it more specific');
      await clickVisibleButton(page, 'Make it more specific');
      await expect(page.getByRole('heading', { name: 'Hint level 3 of 3' })).toBeVisible();
      await captureDiagnostic(page, diagnosticScreenshots, 'pass-3-hint');
      await clickVisibleButton(page, 'Use this hint');
      await expect(page.getByRole('button', { name: /Grade 100%/ })).toBeVisible();

      await clickVisibleButton(page, 'Grade 100%');
      await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
      await captureDiagnostic(page, diagnosticScreenshots, 'pass-3-grade');
      await clickVisibleButton(page, 'Close grade breakdown');

      await clickVisibleButton(page, 'Pause');
      await expect(page.getByText('When you resume')).toBeVisible();
      await captureDiagnostic(page, diagnosticScreenshots, 'pass-3-pause');
      await clickVisibleButton(page, 'Resume mission');
    }
    if (accessibilityAudit) {
      await expect(page.getByRole('button', { name: 'Submit final result' })).toBeVisible();
      await assertCriticalTouchLayout(page);
      await captureDiagnostic(page, diagnosticScreenshots, 'accessibility-completion-actions');
      semanticAssertions.push(
        'long contextual actions and final submission remained touchable without HUD or joystick overlap',
      );
    }
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
      serverTimestamp?: unknown;
    };
    const submissionReceipt: SubmissionReceiptProbe = {
      status: typeof receiptBody.status === 'string' ? receiptBody.status : '',
      matchesRequest:
        typeof receiptBody.attemptId === 'string' &&
        receiptBody.attemptId.length > 0 &&
        receiptBody.attemptId === submissionProbe?.attemptId,
      serverTimestamp:
        typeof receiptBody.serverTimestamp === 'string' ? receiptBody.serverTimestamp : '',
    };
    await expect(page.getByText('Stable cell achieved')).toBeVisible();
    await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
    await expect(page.getByText('Result delivered successfully.')).toBeVisible();
    await capture(page, screenshots, 11, 'results-delivered', true);
    if (pass3Diagnostics) {
      await expect(page.getByText('This graded result is locked.')).toBeVisible();
      await clickVisibleButton(page, 'Continue ungraded practice');
      await expect(page.locator('.timer-card strong')).toHaveText('PRACTICE');
      await expect(page.locator('.feedback-toast')).toContainText('recorded result is locked');
      await expect(page.getByText(/Explore or repair the completed cell/)).toBeVisible();
      await expect(page.getByText(/submit when ready/i)).toHaveCount(0);
      await captureDiagnostic(page, diagnosticScreenshots, 'pass-3-practice');
      await clickVisibleButton(page, 'Pause');
      const practicePause = page.getByRole('dialog', { name: 'Mission paused' });
      await expect(practicePause.getByText(/Explore or repair the completed cell/)).toBeVisible();
      await expect(page.getByText(/submit when ready/i)).toHaveCount(0);
      await clickVisibleButton(page, 'End practice and return to result');
      await expect(page.getByText('This graded result is locked.')).toBeVisible();
      await expect(page.getByText('Result delivered successfully.')).toBeVisible();
      semanticAssertions.push(
        'objective-aware hints preserved the score and ungraded practice preserved the locked result',
      );
    }
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
    const expectedDiagnosticCount = 2 + (accessibilityAudit ? 2 : 0) + (pass3Diagnostics ? 4 : 0);
    expect(diagnosticScreenshots).toHaveLength(expectedDiagnosticCount);
    expect(submissionCallCount, 'submission request count').toBe(1);
    expect(submissionProbe?.attemptId, 'nonempty transient attempt ID').toBeTruthy();
    expect(submissionProbe?.completed, 'completed submission').toBe(true);
    expect(submissionProbe?.total, 'submitted score').toBe(100);
    if (liveSubmission) expect(submissionProbe?.isTest, 'Preview test flag').toBe(true);
    expect(submissionReceipt?.status, 'accepted receipt status').toBe('accepted');
    expect(submissionReceipt?.matchesRequest, 'receipt matches transient attempt ID').toBe(true);
    expect(submissionReceipt?.serverTimestamp, 'nonempty server timestamp').toBeTruthy();
    await page.waitForTimeout(1_000);
    expect(submissionCallCount, 'submission request remains exactly one').toBe(1);
    expect(graphicsContextLossEvents, 'WebGL context-loss events').toBe(0);

    if (liveSubmission) {
      expect(
        transientSubmissionPayload,
        'transient submission payload retained in memory',
      ).toBeTruthy();
      const duplicateResponse = await page
        .context()
        .request.post(new URL('/api/submit', externalBaseURL).toString(), {
          data: transientSubmissionPayload,
        });
      expect(duplicateResponse.ok(), 'duplicate idempotency response').toBe(true);
      const duplicateReceipt = (await duplicateResponse.json()) as {
        attemptId?: unknown;
        status?: unknown;
        serverTimestamp?: unknown;
      };
      expect(duplicateReceipt.attemptId, 'duplicate receipt attempt').toBe(receiptBody.attemptId);
      expect(duplicateReceipt.status, 'duplicate receipt status').toBe(receiptBody.status);
      expect(duplicateReceipt.serverTimestamp, 'duplicate receipt timestamp').toBe(
        receiptBody.serverTimestamp,
      );
      semanticAssertions.push(
        'exact transient payload retry returned the original receipt without a second page submission',
      );
    }

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
      diagnosticScreenshots,
      pageErrors,
      consoleErrors: unallowedConsoleErrors,
      allowedConsoleErrors,
      submissionMode: liveSubmission ? 'preview-forced-test' : 'intercepted-synthetic',
      submissionOutcome: submissionReceipt.status,
      submissionCallCount,
      backendIdempotencyGate: liveSubmission ? 'passed-original-receipt' : 'not-applicable',
      graphicsContextGate: {
        status: 'passed',
        checks: graphicsContextChecks,
        lossEvents: graphicsContextLossEvents,
      },
      outcome: 'success',
    };
    await writeFile(
      path.join(outputDir, 'run.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
  });
});
