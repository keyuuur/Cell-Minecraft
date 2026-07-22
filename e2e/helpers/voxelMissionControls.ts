import { expect, type Locator, type Page } from '@playwright/test';

let pointerSequence = 100;

function nextPointerId(): number {
  pointerSequence += 1;
  return pointerSequence;
}

export function horizontalDistance(left: string | null, right: string | null): number {
  const [leftX, , leftZ] = (left ?? '').split(',').map(Number);
  const [rightX, , rightZ] = (right ?? '').split(',').map(Number);
  if (![leftX, leftZ, rightX, rightZ].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return Math.hypot(leftX - rightX, leftZ - rightZ);
}

export async function expectMissionViewportAnchored(page: Page, mission: Locator): Promise<void> {
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
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.right <= window.innerWidth &&
            rect.bottom <= window.innerHeight
          );
        };
        return {
          objectiveInside: isInside('.voxel-proof-objective'),
          utilitiesInside: isInside('.voxel-proof-utilities'),
          hotbarInside: isInside('.voxel-proof-hotbar'),
          actionsInside: isInside('.voxel-proof-actions'),
          joystickInside: isInside('.voxel-proof-joystick-wrap'),
        };
      }),
    )
    .toEqual({
      objectiveInside: true,
      utilitiesInside: true,
      hotbarInside: true,
      actionsInside: true,
      joystickInside: true,
    });
}

export async function holdJoystick(
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
  const pointerId = nextPointerId();
  await joystick.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: center.x,
    clientY: center.y,
  });
  await joystick.dispatchEvent('pointermove', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
  });
  await page.waitForTimeout(milliseconds);
  await joystick.dispatchEvent('pointerup', {
    pointerId,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: destination.x,
    clientY: destination.y,
  });
  await page.waitForTimeout(90);
}

export async function approachUntil(
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
    if (await condition()) return;
    await recenter.click();
    if (await condition()) return;
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
      } else if (before !== null && after !== null && Math.abs(after - before) < 0.04) {
        await holdJoystick(page, detourDirection, 520);
        await recordNavigation(`stalled-${detourDirection}`);
      }
      await recordNavigation('forward');
    }
    if (await condition()) return;
  }
  await recenter.click();
  await holdJoystick(page, 'backward', 480);
  for (let pulse = 0; pulse < 16; pulse += 1) {
    if (await condition()) return;
    await recenter.click();
    if (await condition()) return;
    await holdJoystick(page, 'forward', 130);
    if (await condition()) return;
  }
  if (await condition()) return;
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

export async function approachAction(
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

export async function holdCurrentAction(
  page: Page,
  mission: Locator,
  action: Locator,
  completed: () => Promise<void>,
): Promise<void> {
  const box = await action.boundingBox();
  if (!box) throw new Error('Primary mission action was not visible.');
  const pointerId = nextPointerId();
  try {
    await action.dispatchEvent('pointerdown', {
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
    });
    await expect(mission).toHaveAttribute('data-mission-action-held', 'true');
    await completed();
  } finally {
    await action.dispatchEvent('pointerup', {
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
    });
  }
  await page.waitForTimeout(180);
}

export async function mineAndCollect(
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
  await approachAction(page, mission, recenter, 'collect', /DROP .* COLLECT/);
  await action.click();
  await expect(mission).toHaveAttribute(inventoryAttribute, expectedCount);
  await expect(mission).toHaveAttribute('data-mission-pickups', '0');
}

export async function completeClassroomTutorial(
  page: Page,
  quality: 'low' | 'standard',
  accessibility = false,
): Promise<void> {
  await page.getByRole('radio', { name: /Touch Only/ }).click();
  await page.getByRole('radio', { name: quality === 'low' ? /^Low/ : /^Standard/ }).click();
  if (accessibility) {
    for (const label of ['Large text', 'High contrast', 'Reduced motion', 'Mute sounds']) {
      const option = page.getByRole('checkbox', { name: label });
      if (!(await option.isChecked())) await option.check();
    }
  }
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
