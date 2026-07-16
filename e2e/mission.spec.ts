import { expect, type Page, test } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

async function completeControlPractice(page: Page, touchOnly = false) {
  const arena = page.getByLabel('Untimed control practice arena');
  if (touchOnly) {
    const joystick = page.getByLabel('Practice movement joystick');
    const dragJoystick = async (pointerId: number, dx: number, dy: number) => {
      await joystick.dispatchEvent('pointerdown', {
        pointerId,
        clientX: 50,
        clientY: 50,
      });
      await joystick.dispatchEvent('pointermove', {
        pointerId,
        clientX: 50 + dx,
        clientY: 50 + dy,
      });
      await joystick.dispatchEvent('pointerup', { pointerId });
    };
    await dragJoystick(1, 50, -16);
  } else {
    await arena.focus();
    await page.keyboard.press('d');
    await page.keyboard.press('d');
    await page.keyboard.press('d');
    await page.keyboard.press('w');
  }
  await page.getByRole('button', { name: 'Interact' }).click();
  if (touchOnly) {
    const joystick = page.getByLabel('Practice movement joystick');
    await joystick.dispatchEvent('pointerdown', { pointerId: 2, clientX: 50, clientY: 50 });
    await joystick.dispatchEvent('pointermove', { pointerId: 2, clientX: 132, clientY: -30 });
    await joystick.dispatchEvent('pointerup', { pointerId: 2 });
  } else {
    await arena.focus();
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('d');
      await page.keyboard.press('w');
    }
  }
  await page.getByRole('button', { name: 'Place' }).click();
  const look = page.getByLabel('Drag here to practice looking');
  const box = await look.boundingBox();
  if (!box) throw new Error('Look practice target was not visible.');
  await page.mouse.move(box.x + 12, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 44, box.y + box.height / 2);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Recenter' }).click();
  await expect(page.getByRole('button', { name: 'Start mission and timer' })).toBeEnabled();
}

async function reachTutorial(page: Page, touchOnly = false) {
  await page.goto('/?test=1');
  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last initial').fill('S');
  await page.getByLabel('Class period').selectOption('1');
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  if (touchOnly) await page.getByRole('radio', { name: /Touch Only/ }).click();
  await completeControlPractice(page, touchOnly);
}

async function startMission(page: Page, touchOnly = false) {
  await reachTutorial(page, touchOnly);
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.getByLabel('Mission controls')).toBeVisible();
}

async function completeMissionWithTools(page: Page) {
  const advance = page.getByRole('button', { name: 'Advance test stage' });
  for (let step = 0; step < 10; step += 1) await advance.click();
  await page.getByRole('button', { name: 'Submit final result' }).click();
}

test('@smoke student reaches the mission without starting the timer early', async ({ page }) => {
  await reachTutorial(page, true);
  await expect(page.getByText('Before the 15-minute timer starts')).toBeVisible();
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.getByLabel('Mission controls')).toBeVisible();
  await expect(page.getByText('TEST MODE · submissions excluded')).toBeVisible();
  await expect(page.getByLabel('Movement joystick')).toBeVisible();
});

test('identification and real control practice fit a 1024 by 680 landscape viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.goto('/?test=1');
  const continueButton = page.getByRole('button', { name: 'Continue to controls' });
  await expect(continueButton).toBeDisabled();
  await expect(continueButton).toBeInViewport();
  for (const field of ['First name', 'Last initial', 'Class period']) {
    const bounds = await page.getByLabel(field).boundingBox();
    if (!bounds) throw new Error(`${field} was not visible.`);
    expect(bounds.height).toBeGreaterThanOrEqual(56);
  }
  const periodContrast = await page.getByLabel('Class period').evaluate((element) => {
    const style = getComputedStyle(element);
    const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (rgb: number[]) => {
      const channels = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : Math.pow((normalized + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const light = luminance(parse(style.color));
    const dark = luminance(parse(style.backgroundColor));
    return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
  });
  expect(periodContrast).toBeGreaterThanOrEqual(4.5);

  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last initial').fill('S');
  await page.getByLabel('Class period').selectOption('1');
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await page.getByRole('radio', { name: /Touch Only/ }).click();
  const start = page.getByRole('button', { name: 'Practice all controls to start' });
  await expect(start).toBeInViewport();
  for (const label of ['Large text', 'High contrast', 'Reduced motion', 'Mute sounds']) {
    const bounds = await page.getByText(label, { exact: true }).locator('..').boundingBox();
    if (!bounds) throw new Error(`${label} target was not visible.`);
    expect(bounds.height).toBeGreaterThanOrEqual(56);
  }
  await completeControlPractice(page, true);
  await expect(page.getByRole('button', { name: 'Start mission and timer' })).toBeInViewport();
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);
});

test('test tooling can exercise the full mission and final score', async ({ page }) => {
  await startMission(page);
  await completeMissionWithTools(page);
  await expect(page.getByText('Stable cell achieved')).toBeVisible();
  await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
});

test('production-shaped mission hides stage skipping', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last initial').fill('S');
  await page.getByLabel('Class period').selectOption('1');
  await page.getByRole('button', { name: 'Continue to controls' }).click();
  await completeControlPractice(page);
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.getByLabel('Mission controls')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advance test stage' })).toHaveCount(0);
  await expect(page.getByText(/TEST MODE/)).toHaveCount(0);
});

test('temporary delivery failure queues and manual retry succeeds', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/submit', async (route) => {
    calls += 1;
    const body = route.request().postDataJSON() as { attemptId: string };
    const temporary = calls === 1;
    await route.fulfill({
      status: temporary ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify({
        attemptId: body.attemptId,
        status: temporary ? 'rejected' : 'accepted',
        serverTimestamp: new Date().toISOString(),
        ...(temporary ? { errorCode: 'SERVER_BUSY' } : {}),
      }),
    });
  });
  await startMission(page);
  await completeMissionWithTools(page);
  await expect(page.getByText(/queued for delivery/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry delivery now' }).click();
  await expect(page.getByText('Result delivered successfully.')).toBeVisible();
});

test('an old queued result retries when a shared iPad returns online', async ({
  page,
  context,
}) => {
  await startMission(page);
  await expect(page.locator('canvas.game-canvas')).toBeVisible();
  await expect(page.locator('.fps-readout')).toHaveText(/[1-9]\d* FPS/);
  await context.setOffline(true);
  await completeMissionWithTools(page);
  await expect(page.getByText(/queued for delivery/)).toBeVisible();
  await page.getByRole('button', { name: 'New student' }).click();
  await expect(page.getByRole('heading', { name: 'Build a Living Cell' })).toBeVisible();

  let deliveredAttempts = 0;
  await page.route('**/api/submit', async (route) => {
    deliveredAttempts += 1;
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
  await context.setOffline(false);
  await expect.poll(() => deliveredAttempts).toBe(1);
});

test('permanent rejection survives reload with diagnostic recovery', async ({ page }) => {
  await page.route('**/api/submit', async (route) => {
    const body = route.request().postDataJSON() as { attemptId: string };
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        attemptId: body.attemptId,
        status: 'rejected',
        serverTimestamp: new Date().toISOString(),
        errorCode: 'INVALID_PAYLOAD',
      }),
    });
  });
  await startMission(page);
  await completeMissionWithTools(page);
  await expect(page.getByRole('button', { name: 'Export delivery diagnostics' })).toBeVisible();
  await page.waitForTimeout(250);
  await page.reload();
  await page.getByRole('button', { name: 'Resume saved attempt' }).click();
  await expect(page.getByRole('button', { name: 'Export delivery diagnostics' })).toBeVisible();
});

test('checkpoint submission unlocks only after the boundary checkpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await startMission(page);
  await page.getByRole('button', { name: /Grade 0%/ }).click();
  await expect(page.getByRole('button', { name: 'Submit this grade early' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close grade breakdown' }).click();
  await page.getByRole('button', { name: 'Advance test stage' }).click();
  await page.getByRole('button', { name: /Grade/ }).click();
  const earlySubmit = page.getByRole('button', { name: 'Submit this grade early' });
  await expect(earlySubmit).toBeVisible();
  await earlySubmit.click();
  await expect(page.getByText('Incomplete rubric categories:')).toBeVisible();
  await expect(page.getByText(/Activation and functions: \d+ of 20 points/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep building' })).toBeVisible();
  const dialog = page.locator('.modal-panel').filter({
    has: page.getByText('Incomplete rubric categories:'),
  });
  const bounds = await dialog.boundingBox();
  if (!bounds) throw new Error('Grade dialog was not visible.');
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(680);
  await page.getByRole('button', { name: 'Keep building' }).click();
  await expect(earlySubmit).toBeFocused();
});

test('objective-aware hints progress without changing the grade', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await startMission(page, true);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByText('No point deduction')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hint level 1 of 3' })).toBeVisible();
  const hintDialog = page.getByRole('dialog', { name: 'Hint level 1 of 3' });
  await expect(hintDialog.getByText(/Place wall panels outside the cell/)).toBeVisible();
  await page.getByRole('button', { name: 'Make it more specific' }).click();
  await expect(page.getByRole('heading', { name: 'Hint level 2 of 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Make it more specific' }).click();
  await expect(page.getByRole('heading', { name: 'Hint level 3 of 3' })).toBeVisible();
  await expect(page.getByText(/Tap Interact now at the Cell wall panels/)).toBeVisible();
  await page.getByRole('button', { name: 'Use this hint' }).click();
  await expect(page.getByRole('button', { name: /Grade 0%/ })).toBeVisible();
  await page.getByRole('button', { name: 'Advance test stage' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByRole('heading', { name: 'Hint level 1 of 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Close hints' }).click();
  await expect(page.getByRole('button', { name: 'Hint' })).toBeFocused();
});

test('results keep the locked grade, delivery, and next actions visible in landscape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 680 });
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
  await startMission(page, true);
  await completeMissionWithTools(page);
  await expect(page.getByText('Stable cell achieved')).toBeVisible();
  await expect(page.getByText('This graded result is locked.')).toBeVisible();
  await expect(page.getByText('Result delivered successfully.')).toBeVisible();
  const freshAttempt = page.getByRole('button', { name: 'Start a fresh graded attempt' });
  await expect(freshAttempt).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Continue ungraded practice' })).toBeInViewport();
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(1);
  expect(overflow.vertical).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Continue ungraded practice' }).click();
  await expect(page.getByText('PRACTICE', { exact: true })).toBeVisible();
  await expect(page.getByText(/recorded result is locked/)).toBeVisible();
  await expect(page.getByText(/Explore or repair the completed cell/)).toBeVisible();
  await expect(page.getByText(/submit when ready/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: 'Make it more specific' }).click();
  await page.getByRole('button', { name: 'Make it more specific' }).click();
  await expect(page.getByText(/End practice to return to your locked result/)).toBeVisible();
  await expect(page.getByText(/Submit final result/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close hints' }).click();
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByRole('button', { name: 'Return to ungraded practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: /submit final result/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to ungraded practice' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText(/Practice is ungraded/)).toBeVisible();
  const practicePause = page.getByRole('dialog', { name: 'Mission paused' });
  await expect(practicePause.getByText(/Explore or repair the completed cell/)).toBeVisible();
  await expect(page.getByText(/submit when ready/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'End practice and return to result' }).click();
  await expect(page.getByText('This graded result is locked.')).toBeVisible();
  await expect(page.getByText('Result delivered successfully.')).toBeVisible();
});

test('hydrated baseline, drought wilt, and recovery are visibly distinct', async ({ page }) => {
  await startMission(page);
  const advance = page.getByRole('button', { name: 'Advance test stage' });
  for (let step = 0; step < 5; step += 1) await advance.click();
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByText('100% pressure')).toBeVisible();
  await expect(page.getByText(/Baseline: the vacuole is full/)).toBeVisible();
  await page.getByRole('button', { name: 'Close overview' }).click();
  await advance.click();
  await page.getByRole('button', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Begin water-availability challenge' }).click();
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByText('25% pressure')).toBeVisible();
  await expect(page.getByText(/central vacuole is shrinking/)).toBeVisible();
  await page.getByRole('button', { name: 'Close overview' }).click();
  await advance.click();
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByText('100% pressure')).toBeVisible();
  await expect(page.getByText(/Turgor pressure increased/)).toBeVisible();
});

test('iPad-size controls stay touchable and do not overlap the joystick', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await startMission(page, true);
  const joystick = await page.getByLabel('Movement joystick').boundingBox();
  if (!joystick) throw new Error('Joystick was not visible.');
  const controls = [
    'Pause',
    'Overview',
    'Recenter',
    /Grade/,
    'Hint',
    'Interact',
    'Place',
    'Remove selected',
  ];
  for (const name of controls) {
    const button =
      name === 'Interact'
        ? page.locator('.action-cluster .context-action')
        : page.getByRole('button', { name }).first();
    const bounds = await button.boundingBox();
    if (!bounds) throw new Error(`Missing control: ${String(name)}`);
    expect(bounds.width).toBeGreaterThanOrEqual(56);
    expect(bounds.height).toBeGreaterThanOrEqual(56);
    expect(overlaps(joystick, bounds), `${String(name)} overlaps the movement joystick`).toBe(
      false,
    );
    const hitTarget = await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit?.closest('button')?.textContent?.trim() ?? '';
      },
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    );
    expect(hitTarget).toContain(typeof name === 'string' ? name : 'Grade');
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
  await page.getByRole('button', { name: 'Place' }).click();
  await expect(page.getByText('Collect a module from a supply depot first.')).toBeVisible();
  const virtualJoystick = page.getByLabel('Movement joystick');
  await virtualJoystick.dispatchEvent('pointerdown', { pointerId: 21, clientX: 70, clientY: 500 });
  await expect(virtualJoystick).toHaveClass(/is-active/);
  await virtualJoystick.dispatchEvent('lostpointercapture', { pointerId: 21 });
  await expect(virtualJoystick).not.toHaveClass(/is-active/);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test('touch-only accessibility settings keep the overview usable at iPad size', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await reachTutorial(page, true);
  await page.getByRole('checkbox', { name: 'Large text' }).check();
  await page.getByRole('checkbox', { name: 'High contrast' }).check();
  await page.getByRole('checkbox', { name: 'Reduced motion' }).check();
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await page.getByRole('button', { name: 'Overview' }).click();

  const shell = page.getByTestId('app-shell');
  await expect(shell).toHaveClass(/large-text/);
  await expect(shell).toHaveClass(/high-contrast/);
  await expect(shell).toHaveClass(/reduced-motion/);
  const dialog = page.getByRole('dialog', { name: 'Cell overview' });
  const bounds = await dialog.boundingBox();
  if (!bounds) throw new Error('Overview dialog was not visible.');
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(680);
  const close = page.getByRole('button', { name: 'Close overview' });
  const closeBounds = await close.boundingBox();
  if (!closeBounds) throw new Error('Overview close control was not visible.');
  expect(closeBounds.height).toBeGreaterThanOrEqual(56);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Overview' })).toBeFocused();
});

test('reload offers recovery of the active attempt', async ({ page }) => {
  await startMission(page);
  await page.getByRole('button', { name: 'Advance test stage' }).click();
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume saved attempt' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume saved attempt' }).click();
  await expect(page.getByLabel('Mission controls')).toBeVisible();
  await expect(page.getByRole('button', { name: /Grade 28%/ })).toBeVisible();
});
