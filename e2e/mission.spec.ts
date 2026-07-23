import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ timeout: 120_000 });

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

async function identify(page: Page, firstName = 'Test', lastInitial = 'S', period = '1') {
  await page.getByLabel('First name').fill(firstName);
  await page.getByLabel('Last initial').fill(lastInitial);
  await page.getByLabel('Class period').selectOption(period);
  const continueButton = page.getByRole('button', { name: 'Continue to controls' });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
}

async function completeControlPractice(page: Page, touchOnly = false) {
  const arena = page.getByLabel('Untimed control practice arena');
  const joystick = page.getByLabel('Practice movement joystick');
  if (touchOnly) {
    const box = await joystick.boundingBox();
    if (!box) throw new Error('Practice movement joystick was not visible.');
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const dragJoystick = async (pointerId: number, dx: number, dy: number) => {
      await joystick.dispatchEvent('pointerdown', {
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        clientX: center.x,
        clientY: center.y,
      });
      await joystick.dispatchEvent('pointermove', {
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        clientX: center.x + dx,
        clientY: center.y + dy,
      });
      await joystick.dispatchEvent('pointerup', {
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
      });
    };
    await dragJoystick(1, 50, -16);
  } else {
    await arena.focus();
    await page.keyboard.press('d');
    await page.keyboard.press('d');
    await page.keyboard.press('d');
    await page.keyboard.press('w');
  }
  await page.getByRole('button', { name: 'Hold tool to mine' }).click();
  await page.getByRole('button', { name: 'Collect' }).click();
  if (touchOnly) {
    const box = await joystick.boundingBox();
    if (!box) throw new Error('Practice movement joystick was not visible.');
    await joystick.dispatchEvent('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
    });
    await joystick.dispatchEvent('pointermove', {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      clientX: box.x + box.width / 2 + 82,
      clientY: box.y + box.height / 2 - 80,
    });
    await joystick.dispatchEvent('pointerup', {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
    });
  } else {
    await arena.focus();
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('d');
      await page.keyboard.press('w');
    }
  }
  const place = page.getByRole('button', { name: 'Place' });
  await expect(place).toBeEnabled();
  await place.click();
  const inspect = page.getByRole('button', { name: 'Inspect' });
  await expect(inspect).toBeEnabled();
  await inspect.click();
  const look = page.getByLabel('Drag here to practice looking');
  const box = await look.boundingBox();
  if (!box) throw new Error('Look practice target was not visible.');
  await look.dispatchEvent('pointerdown', {
    pointerId: 3,
    pointerType: touchOnly ? 'touch' : 'mouse',
    clientX: box.x + 12,
    clientY: box.y + box.height / 2,
  });
  await look.dispatchEvent('pointermove', {
    pointerId: 3,
    pointerType: touchOnly ? 'touch' : 'mouse',
    clientX: box.x + 44,
    clientY: box.y + box.height / 2,
  });
  await look.dispatchEvent('pointerup', {
    pointerId: 3,
    pointerType: touchOnly ? 'touch' : 'mouse',
  });
  await page.getByRole('button', { name: 'Recenter' }).click();
  await expect(page.getByRole('button', { name: 'Start mission and timer' })).toBeEnabled();
}

async function reachTutorial(
  page: Page,
  options: {
    testMode?: boolean;
    touchOnly?: boolean;
    firstName?: string;
    lastInitial?: string;
    period?: string;
  } = {},
) {
  await page.goto(options.testMode === false ? '/' : '/?test=1');
  await identify(
    page,
    options.firstName ?? 'Test',
    options.lastInitial ?? 'S',
    options.period ?? '1',
  );
  if (options.touchOnly) await page.getByRole('radio', { name: /Touch Only/ }).click();
  await completeControlPractice(page, options.touchOnly);
}

async function startMission(
  page: Page,
  options: {
    testMode?: boolean;
    touchOnly?: boolean;
    firstName?: string;
    lastInitial?: string;
    period?: string;
  } = {},
) {
  await reachTutorial(page, options);
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.locator('main.voxel-mission')).toBeVisible({ timeout: 30_000 });
}

async function advanceTestStage(page: Page, count = 1) {
  const mission = page.locator('main.voxel-mission');
  const advance = page.getByRole('button', { name: 'Advance test stage' });
  for (let step = 0; step < count; step += 1) {
    const revision = Number(await mission.getAttribute('data-mission-revision'));
    await advance.click();
    await expect
      .poll(async () => Number(await mission.getAttribute('data-mission-revision')))
      .toBeGreaterThan(revision);
    await expect(advance).toBeEnabled();
  }
}

async function completeMissionWithTools(page: Page) {
  await advanceTestStage(page, 5);
  const submit = page.getByRole('button', { name: 'Submit the final graded result' });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Stable cell achieved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
}

test('@smoke student reaches the unified mission without starting the timer early', async ({
  page,
}) => {
  await reachTutorial(page, { touchOnly: true });
  await expect(page.getByText('Before the 15-minute timer starts')).toBeVisible();
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.locator('main.voxel-mission')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('TEST MODE · submissions excluded')).toBeVisible();
  await expect(page.getByRole('application', { name: /Movement joystick/ })).toBeVisible();
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
  await identify(page);
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

test('development tools can exercise the unified mission and lock one local 100 percent result', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await startMission(page);
  await completeMissionWithTools(page);
  await expect(page.getByText('Saved on this iPad')).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(apiRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('production-shaped mission hides every local stage and timer bypass', async ({ page }) => {
  await startMission(page, { testMode: false });
  await expect(page.getByRole('button', { name: 'Advance test stage' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set active timer to limit' })).toHaveCount(0);
  await expect(page.getByText(/TEST MODE/)).toHaveCount(0);
});

test('a queued immutable result survives reload and identity-matched resume', async ({ page }) => {
  await startMission(page, { firstName: 'Resume', lastInitial: 'R', period: '2' });
  await completeMissionWithTools(page);
  await expect(page.getByText('Saved on this iPad')).toBeVisible();
  await page.reload();
  await identify(page, 'Resume', 'R', '2');
  await expect(
    page.getByText('A matching saved attempt is available on this device.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resume matching attempt' }).click();
  await expect(page.getByRole('heading', { name: 'Stable cell achieved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
});

test('a different student receives a privacy-neutral handoff instead of prior details', async ({
  page,
}) => {
  await startMission(page, { firstName: 'StudentA', lastInitial: 'A', period: '3' });
  await advanceTestStage(page);
  await page.reload();
  await identify(page, 'StudentB', 'B', '4');
  await expect(page.getByText(/A prior student session must be protected/)).toBeVisible();
  await expect(page.getByText('StudentA')).toHaveCount(0);
  await expect(page.getByText(/\d+%/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Protect prior work and continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose and practice your controls' }),
  ).toBeVisible();
});

test('early submission locks only the earned boundary checkpoint', async ({ page }) => {
  await startMission(page);
  await page.getByRole('button', { name: 'GRADE' }).click();
  await expect(page.getByRole('button', { name: 'SUBMIT THIS GRADE EARLY' })).toHaveCount(0);
  await page.getByRole('button', { name: 'RETURN TO MISSION' }).click();
  await advanceTestStage(page);
  await page.getByRole('button', { name: 'GRADE' }).click();
  await page.getByRole('button', { name: 'SUBMIT THIS GRADE EARLY' }).click();
  await expect(page.getByText(/Unfinished objectives remain unearned/)).toBeVisible();
  await page.getByRole('button', { name: 'SUBMIT EARLY RESULT' }).click();
  await expect(page.getByRole('heading', { name: 'Early result saved' })).toBeVisible();
  await expect(page.getByText('Saved on this iPad')).toBeVisible();
});

test('active-time limit auto-locks the current partial result', async ({ page }) => {
  await startMission(page);
  await advanceTestStage(page);
  await page.getByRole('button', { name: 'Set active timer to limit' }).click();
  await expect(page.getByRole('heading', { name: 'Active time ended' })).toBeVisible();
  await expect(page.getByText('Saved on this iPad')).toBeVisible();
});

test('objective-aware hints progress without changing the checkpoint grade', async ({ page }) => {
  await startMission(page, { touchOnly: true });
  const mission = page.locator('main.voxel-mission');
  const scoreBefore = await mission.getAttribute('data-mission-score');
  await page.getByRole('button', { name: 'HINT 1/3' }).click();
  await expect(
    page.locator('.voxel-classroom-hint').getByText('HINT 1/3', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'HINT 2/3' }).click();
  await expect(
    page.locator('.voxel-classroom-hint').getByText('HINT 2/3', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'HINT 3/3' }).click();
  await expect(
    page.locator('.voxel-classroom-hint').getByText('HINT 3/3', { exact: true }),
  ).toBeVisible();
  await expect(mission).toHaveAttribute('data-mission-score', scoreBefore!);
});

test('results preserve the immutable grade throughout ungraded practice', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await startMission(page, { touchOnly: true });
  await completeMissionWithTools(page);
  await expect(page.getByText('This graded result is immutable.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue ungraded practice' }).click();
  await expect(page.getByText(/UNGRADED PRACTICE/)).toBeVisible();
  await expect(page.getByText('UNTIMED PRACTICE')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit the final graded result' })).toHaveCount(0);
  await page.getByRole('button', { name: 'END PRACTICE' }).click();
  await expect(page.getByRole('heading', { name: 'Stable cell achieved' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '100%' })).toBeVisible();
});

test('touch-only accessibility settings keep the integrated overview usable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.goto('/?test=1');
  await identify(page);
  await page.getByRole('radio', { name: /Touch Only/ }).click();
  for (const label of ['Large text', 'High contrast', 'Reduced motion', 'Mute sounds']) {
    await page.getByRole('checkbox', { name: label }).check();
  }
  await completeControlPractice(page, true);
  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.locator('main.voxel-mission')).toBeVisible({ timeout: 30_000 });
  const shell = page.getByTestId('app-shell');
  await expect(shell).toHaveClass(/large-text/);
  await expect(shell).toHaveClass(/high-contrast/);
  await expect(shell).toHaveClass(/reduced-motion/);
  await page.getByRole('button', { name: 'OVERVIEW' }).click();
  await expect(page.getByText('CELL SYSTEM OVERVIEW')).toBeVisible();
  const close = page.getByRole('button', { name: 'CLOSE VIEW' });
  const closeBounds = await close.boundingBox();
  if (!closeBounds) throw new Error('Overview close control was not visible.');
  expect(closeBounds.height).toBeGreaterThanOrEqual(56);
  await close.click();
});

test('critical touch controls remain distinct from the movement joystick', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await startMission(page, { touchOnly: true });
  const joystick = await page.getByRole('application', { name: /Movement joystick/ }).boundingBox();
  if (!joystick) throw new Error('Joystick was not visible.');
  for (const name of ['RECENTER', 'OVERVIEW', 'PAUSE', 'GRADE', 'HINT 1/3']) {
    const bounds = await page.getByRole('button', { name }).boundingBox();
    if (!bounds) throw new Error(`Missing control: ${name}`);
    expect(bounds.width).toBeGreaterThanOrEqual(56);
    expect(bounds.height).toBeGreaterThanOrEqual(56);
    expect(overlaps(joystick, bounds), `${name} overlaps the movement joystick`).toBe(false);
  }
});

test('reload offers identity-matched recovery of an active integrated attempt', async ({
  page,
}) => {
  await startMission(page, { firstName: 'Active', lastInitial: 'V', period: '5' });
  await advanceTestStage(page);
  await expect(page.getByText(/Saved/).first()).toBeVisible();
  await page.reload();
  await identify(page, 'Active', 'V', '5');
  await expect(
    page.getByText('A matching saved attempt is available on this device.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resume matching attempt' }).click();
  await expect(page.locator('main.voxel-mission')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main.voxel-mission')).toHaveAttribute('data-mission-wall-count', '6');
});

test('a failed IndexedDB health probe blocks graded start without claiming a save', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(IDBFactory.prototype, 'open', {
      configurable: true,
      value: (...args: Parameters<IDBFactory['open']>) => {
        throw new DOMException(`Blocked test open for ${String(args[0])}`, 'UnknownError');
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText(/Local saving is unavailable/)).toBeVisible();
  await page.getByLabel('First name').fill('Blocked');
  await page.getByLabel('Last initial').fill('B');
  await page.getByLabel('Class period').selectOption('6');
  await expect(page.getByRole('button', { name: /Checking local saving/ })).toBeDisabled();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('teacher reset reports and clears all local stores only after typed confirmation', async ({
  page,
}) => {
  await startMission(page, { firstName: 'Reset', lastInitial: 'Z', period: '7' });
  await completeMissionWithTools(page);
  await page.getByRole('button', { name: 'New student' }).click();
  await page.getByRole('button', { name: 'Teacher device reset' }).click();
  await expect(page.getByRole('heading', { name: 'Teacher-only full device reset' })).toBeVisible();
  await expect(page.getByText(/1 local attempt\(s\), 1 queued result\(s\)/)).toBeVisible();
  const confirmation = await page.locator('.teacher-reset-panel strong').textContent();
  if (!confirmation) throw new Error('Teacher reset confirmation phrase was unavailable.');
  const erase = page.getByRole('button', { name: 'Erase all local data' });
  await expect(erase).toBeDisabled();
  await page.locator('.teacher-reset-panel input').fill(confirmation);
  await erase.click();
  await page.getByRole('button', { name: 'Teacher device reset' }).click();
  await expect(page.getByText(/0 local attempt\(s\), 0 queued result\(s\)/)).toBeVisible();
});
