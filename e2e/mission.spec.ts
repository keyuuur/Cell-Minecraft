import { expect, type Page, test } from '@playwright/test';

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
  await startMission(page);
  await page.getByRole('button', { name: /Grade 0%/ }).click();
  await expect(page.getByRole('button', { name: 'Submit this grade early' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close grade breakdown' }).click();
  await page.getByRole('button', { name: 'Advance test stage' }).click();
  await page.getByRole('button', { name: /Grade/ }).click();
  await expect(page.getByRole('button', { name: 'Submit this grade early' })).toBeVisible();
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
  for (const name of [
    'Overview',
    'Recenter',
    /Grade/,
    'Hint',
    'Interact',
    'Place',
    'Remove selected',
  ]) {
    const button = page.getByRole('button', { name }).first();
    const bounds = await button.boundingBox();
    if (!bounds) throw new Error(`Missing control: ${String(name)}`);
    expect(bounds.height).toBeGreaterThanOrEqual(56);
    const overlaps = !(
      joystick.x + joystick.width <= bounds.x ||
      bounds.x + bounds.width <= joystick.x ||
      joystick.y + joystick.height <= bounds.y ||
      bounds.y + bounds.height <= joystick.y
    );
    expect(overlaps, `${String(name)} overlaps the movement joystick`).toBe(false);
  }
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
