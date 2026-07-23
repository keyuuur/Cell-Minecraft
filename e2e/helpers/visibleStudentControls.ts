import { expect, type Locator, type Page } from '@playwright/test';

type Direction = 'forward' | 'backward' | 'left' | 'right';
let missionPointerId = 100;

export async function completeVisibleTouchTutorial(page: Page): Promise<void> {
  const joystick = page.getByLabel('Practice movement joystick');
  const joystickBox = await joystick.boundingBox();
  if (!joystickBox) throw new Error('Practice movement joystick was not visible.');
  const center = {
    x: joystickBox.x + joystickBox.width / 2,
    y: joystickBox.y + joystickBox.height / 2,
  };
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
  await page.getByRole('button', { name: 'Hold tool to mine' }).click();
  await page.getByRole('button', { name: 'Collect' }).click();
  await dragJoystick(2, 82, -80);
  await page.getByRole('button', { name: 'Place' }).click();
  await page.getByRole('button', { name: 'Inspect' }).click();

  const look = page.getByLabel('Drag here to practice looking');
  const lookBox = await look.boundingBox();
  if (!lookBox) throw new Error('Tutorial look practice was not visible.');
  await look.dispatchEvent('pointerdown', {
    pointerId: 3,
    pointerType: 'touch',
    isPrimary: true,
    clientX: lookBox.x + 12,
    clientY: lookBox.y + lookBox.height / 2,
  });
  await look.dispatchEvent('pointermove', {
    pointerId: 3,
    pointerType: 'touch',
    isPrimary: true,
    clientX: lookBox.x + 44,
    clientY: lookBox.y + lookBox.height / 2,
  });
  await look.dispatchEvent('pointerup', {
    pointerId: 3,
    pointerType: 'touch',
    isPrimary: true,
  });
  await page.getByRole('button', { name: 'Recenter' }).click();
  await expect(page.getByRole('button', { name: 'Start mission and timer' })).toBeEnabled();
}

export async function pulseMissionJoystick(
  page: Page,
  direction: Direction,
  milliseconds = 220,
): Promise<void> {
  const joystick = page.getByRole('application', { name: /Movement joystick/ });
  const box = await joystick.boundingBox();
  if (!box) throw new Error('Mission movement joystick was not visible.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const vertical = direction === 'forward' || direction === 'backward';
  const destination = {
    x: vertical ? center.x : box.x + box.width * (direction === 'left' ? 0.12 : 0.88),
    y: vertical ? box.y + box.height * (direction === 'forward' ? 0.12 : 0.88) : center.y,
  };
  const pointerId = (missionPointerId += 1);
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
    clientX: destination.x,
    clientY: destination.y,
  });
  await page.waitForTimeout(milliseconds);
  await joystick.dispatchEvent('pointerup', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
  });
  await page.waitForTimeout(90);
}

async function nudgeMissionCrosshair(page: Page, pulse: number): Promise<void> {
  const canvas = page.getByLabel('First-person integrated voxel plant-cell construction mission');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The first-person mission view was not visible.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const nudges = [
    { x: -86, y: 72 },
    { x: 86, y: 72 },
    { x: -132, y: 108 },
    { x: 132, y: 108 },
    { x: 0, y: 142 },
  ] as const;
  const nudge = nudges[pulse % nudges.length];
  const pointerId = (missionPointerId += 1);
  await canvas.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX: center.x,
    clientY: center.y,
  });
  await canvas.dispatchEvent('pointermove', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    clientX: center.x + nudge.x,
    clientY: center.y + nudge.y,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
  });
  await page.waitForTimeout(120);
}

async function visibleTargetText(page: Page): Promise<string> {
  const label = page.locator('.voxel-proof-target-label');
  if ((await label.count()) === 0) return '';
  return (await label.textContent({ timeout: 250 }).catch(() => '')) ?? '';
}

export async function navigateToVisibleAction(
  page: Page,
  accessibleName: string | RegExp,
  targetLabel: RegExp,
  detour: 'left' | 'right' = 'right',
): Promise<Locator> {
  const recenter = page.getByRole('button', { name: 'RECENTER' });
  const recentTargets: string[] = [];
  const matchingAction = () => page.getByRole('button', { name: accessibleName });
  const reached = async () => {
    const action = matchingAction();
    const target = await visibleTargetText(page);
    return (await action.count()) === 1 && (await action.isEnabled()) && targetLabel.test(target);
  };

  for (let pulse = 0; pulse < 52; pulse += 1) {
    if (await reached()) return matchingAction();
    await recenter.click();
    if (await reached()) return matchingAction();

    const target = await visibleTargetText(page);
    recentTargets.push(target || '(no visible target)');
    if (recentTargets.length > 12) recentTargets.shift();

    if (!target) {
      await pulseMissionJoystick(page, 'forward', 180);
    } else if (/WALK FORWARD/i.test(target)) {
      await pulseMissionJoystick(page, 'forward', 180);
    } else if (/STEP BACK/i.test(target)) {
      await pulseMissionJoystick(page, 'backward', 420);
    } else if (/BLOCKED LOCATION/i.test(target)) {
      if (pulse % 3 === 2) {
        await pulseMissionJoystick(page, detour, 420);
      } else {
        await nudgeMissionCrosshair(page, pulse);
      }
    } else if (pulse > 0 && pulse % 7 === 0) {
      await pulseMissionJoystick(page, detour, 500);
    } else if (pulse > 0 && pulse % 13 === 0) {
      await pulseMissionJoystick(page, 'backward', 380);
    } else {
      await pulseMissionJoystick(page, 'forward', pulse > 36 ? 130 : 220);
    }
  }

  throw new Error(
    `Visible guidance did not reach ${String(accessibleName)} at ${targetLabel}. Recent targets: ${recentTargets.join(' | ')}`,
  );
}

export async function holdVisibleActionUntil(
  page: Page,
  action: Locator,
  completed: () => Promise<void>,
): Promise<void> {
  const box = await action.boundingBox();
  if (!box) throw new Error('The visible mission action was not available.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  let touchFallback = false;
  try {
    try {
      await expect(page.getByRole('progressbar', { name: /Mining|Removal/ })).toBeVisible({
        timeout: 800,
      });
    } catch {
      await page.mouse.up();
      await action.dispatchEvent('pointerdown', {
        pointerId: 71,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
      });
      touchFallback = true;
    }
    await completed();
  } finally {
    if (touchFallback) {
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

export async function mineAndCollectVisibleSupply(
  page: Page,
  label: string,
  detour: 'left' | 'right' = 'right',
): Promise<void> {
  const mine = await navigateToVisibleAction(
    page,
    new RegExp(`Mine ${label} supply crate`, 'i'),
    new RegExp(`${label} supply`, 'i'),
    detour,
  );
  await holdVisibleActionUntil(page, mine, async () => {
    await expect(page.locator('.voxel-proof-feedback')).toContainText(
      `${label} supply released as a physical model drop`,
      { timeout: 5_000 },
    );
  });
  const collect = await navigateToVisibleAction(
    page,
    new RegExp(`Collect ${label} model drop`, 'i'),
    new RegExp(`${label} drop`, 'i'),
    detour,
  );
  await collect.click();
}

export async function placeAndInspectVisibleStructure(
  page: Page,
  label: string,
  detour: 'left' | 'right' = 'right',
): Promise<void> {
  const place = await navigateToVisibleAction(
    page,
    new RegExp(`Place ${label}`, 'i'),
    new RegExp(`Valid ${label} location`, 'i'),
    detour,
  );
  await place.click();
  const inspect = await navigateToVisibleAction(
    page,
    new RegExp(`Inspect ${label} function`, 'i'),
    new RegExp(`${label}.*inspect`, 'i'),
    detour,
  );
  await inspect.click();
}
