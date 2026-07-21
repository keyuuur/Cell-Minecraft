import { expect, test, type Locator, type Page } from '@playwright/test';

async function holdActionUntil(
  page: Page,
  button: Locator,
  completed: () => Promise<void>,
): Promise<void> {
  await button.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
  });
  try {
    await completed();
  } finally {
    await page.locator('.voxel-proof-mine').dispatchEvent('pointerup', {
      pointerId: 71,
      pointerType: 'touch',
      isPrimary: true,
    });
  }
  await page.waitForTimeout(250);
}

async function holdJoystick(
  page: Page,
  direction: 'forward' | 'backward' | 'left' | 'right',
  milliseconds: number,
): Promise<void> {
  const joystick = page.getByRole('application', { name: /Movement joystick/ });
  const box = await joystick.boundingBox();
  if (!box) throw new Error('Movement joystick was not visible.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const destination =
    direction === 'forward'
      ? { x: center.x, y: box.y + box.height * 0.12 }
      : direction === 'backward'
        ? { x: center.x, y: box.y + box.height * 0.88 }
        : {
            x: box.x + box.width * (direction === 'left' ? 0.12 : 0.88),
            y: center.y,
          };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 4 });
  await page.waitForTimeout(milliseconds);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

async function nudgeJoystickUntilCellChanges(
  page: Page,
  proof: Locator,
  direction: 'forward' | 'backward' | 'left' | 'right',
): Promise<void> {
  const previousCell = await proof.getAttribute('data-foundation-player-cell');
  if (!previousCell) throw new Error('Player cell was unavailable before joystick movement.');
  const joystick = page.getByRole('application', { name: /Movement joystick/ });
  const box = await joystick.boundingBox();
  if (!box) throw new Error('Movement joystick was not visible.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const destination =
    direction === 'forward'
      ? { x: center.x, y: box.y + box.height * 0.12 }
      : direction === 'backward'
        ? { x: center.x, y: box.y + box.height * 0.88 }
        : {
            x: box.x + box.width * (direction === 'left' ? 0.12 : 0.88),
            y: center.y,
          };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 4 });
  try {
    await expect(proof).not.toHaveAttribute('data-foundation-player-cell', previousCell, {
      timeout: 2_000,
    });
  } finally {
    await page.mouse.up();
  }
  await page.waitForTimeout(100);
}

async function retreatFromTarget(
  page: Page,
  proof: Locator,
  minimumCellDistance = 2,
  maximumNudges = 8,
): Promise<void> {
  for (let index = 0; index < maximumNudges; index += 1) {
    const playerCell = ((await proof.getAttribute('data-foundation-player-cell')) ?? '').split(',');
    const targetCell = ((await proof.getAttribute('data-foundation-target-cell')) ?? '').split(',');
    const playerX = Number(playerCell[0]);
    const playerZ = Number(playerCell[2]);
    const targetX = Number(targetCell[0]);
    const targetZ = Number(targetCell[2]);
    if (![playerX, playerZ, targetX, targetZ].every(Number.isFinite)) {
      throw new Error('Player or target cell was unavailable before retreat.');
    }
    if (Math.hypot(playerX - targetX, playerZ - targetZ) >= minimumCellDistance) return;
    await nudgeJoystickUntilCellChanges(page, proof, 'backward');
  }
  throw new Error(`Player did not retreat ${minimumCellDistance} grid units from the target.`);
}

async function walkForwardUntilCellZ(
  page: Page,
  proof: Locator,
  maximumCellZ: number,
  maximumPulses = 24,
): Promise<void> {
  for (let index = 0; index < maximumPulses; index += 1) {
    const cell = (await proof.getAttribute('data-foundation-player-cell')) ?? '';
    const z = Number(cell.split(',')[2]);
    if (Number.isFinite(z) && z <= maximumCellZ) return;
    await holdJoystick(page, 'forward', 200);
  }
  throw new Error(`Player did not reach z <= ${maximumCellZ} through visible movement.`);
}

async function walkBackwardUntilCellZ(
  page: Page,
  proof: Locator,
  minimumCellZ: number,
  maximumPulses = 12,
): Promise<void> {
  for (let index = 0; index < maximumPulses; index += 1) {
    const cell = (await proof.getAttribute('data-foundation-player-cell')) ?? '';
    const z = Number(cell.split(',')[2]);
    if (Number.isFinite(z) && z >= minimumCellZ) return;
    await holdJoystick(page, 'backward', 150);
  }
  throw new Error(`Player did not reach z >= ${minimumCellZ} through visible movement.`);
}

async function walkToOrAcrossCellX(
  page: Page,
  proof: Locator,
  targetCellX: number,
  maximumPulses = 24,
): Promise<void> {
  const visitedCells: number[] = [];
  for (let index = 0; index < maximumPulses; index += 1) {
    const cell = (await proof.getAttribute('data-foundation-player-cell')) ?? '';
    const x = Number(cell.split(',')[0]);
    if (Number.isFinite(x)) visitedCells.push(x);
    if (x === targetCellX) return;
    if (!Number.isFinite(x)) throw new Error('Player x cell was unavailable.');
    await nudgeJoystickUntilCellChanges(page, proof, x > targetCellX ? 'left' : 'right');
    const nextCell = (await proof.getAttribute('data-foundation-player-cell')) ?? '';
    const nextX = Number(nextCell.split(',')[0]);
    if (
      nextX === targetCellX ||
      (x < targetCellX && nextX > targetCellX) ||
      (x > targetCellX && nextX < targetCellX)
    ) {
      return;
    }
  }
  throw new Error(
    `Player did not reach or cross x cell ${targetCellX} through visible movement. Last cells: ${visitedCells.slice(-12).join(',')}.`,
  );
}

async function walkToOrAcrossCellZ(
  page: Page,
  proof: Locator,
  targetCellZ: number,
  maximumPulses = 24,
): Promise<void> {
  for (let index = 0; index < maximumPulses; index += 1) {
    const cell = (await proof.getAttribute('data-foundation-player-cell')) ?? '';
    const z = Number(cell.split(',')[2]);
    if (z === targetCellZ) return;
    if (!Number.isFinite(z)) throw new Error('Player z cell was unavailable.');
    await nudgeJoystickUntilCellChanges(page, proof, z > targetCellZ ? 'forward' : 'backward');
    const nextCell = (await proof.getAttribute('data-foundation-player-cell')) ?? '';
    const nextZ = Number(nextCell.split(',')[2]);
    if (
      nextZ === targetCellZ ||
      (z < targetCellZ && nextZ > targetCellZ) ||
      (z > targetCellZ && nextZ < targetCellZ)
    ) {
      return;
    }
  }
  throw new Error(`Player did not reach or cross z cell ${targetCellZ} through visible movement.`);
}

async function walkBackwardUntilMinimumCellX(
  page: Page,
  proof: Locator,
  minimumCellX: number,
  maximumPulses = 12,
): Promise<void> {
  for (let index = 0; index < maximumPulses; index += 1) {
    const cell = (await proof.getAttribute('data-foundation-player-cell')) ?? '';
    const x = Number(cell.split(',')[0]);
    if (Number.isFinite(x) && x >= minimumCellX) return;
    await holdJoystick(page, 'backward', 150);
  }
  throw new Error(
    `Player did not reach x cell ${minimumCellX} or greater through visible movement.`,
  );
}

async function recenterUntilFace(
  page: Page,
  recenter: Locator,
  expectedFace: 'FRONT' | 'SIDE' | 'TOP',
): Promise<void> {
  const targetLabel = page.locator('.voxel-proof-target-label');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await recenter.click();
    try {
      await expect(targetLabel).toContainText(`VALID ${expectedFace} FACE`, { timeout: 2_500 });
      return;
    } catch {
      if (attempt === 3) throw new Error(`Recenter did not reacquire the ${expectedFace} face.`);
      await holdJoystick(page, 'backward', 220);
    }
  }
}

test('voxel foundation completes through visible controls without persistence or API traffic', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/?proof=voxel');
  const proof = page.locator('main.voxel-proof');
  const recenter = page.getByRole('button', { name: /RECENTER/ });
  const mine = page.locator('.voxel-proof-mine');

  await expect(proof).toHaveAttribute('data-proof-phase', 'mine-supplies', { timeout: 30_000 });
  await expect(proof).toHaveAttribute('data-foundation-world', '24x12x24', { timeout: 30_000 });
  await expect(proof).toHaveAttribute('data-foundation-player-cell', /^\d+,\d+,\d+$/, {
    timeout: 30_000,
  });

  for (let index = 0; index < 3; index += 1) {
    await recenter.click();
    await page.waitForTimeout(250);
    await holdActionUntil(page, mine, () =>
      expect(proof).toHaveAttribute('data-foundation-pickups-active', String(index + 1), {
        timeout: 5_000,
      }),
    );
  }
  await expect(proof).toHaveAttribute('data-proof-phase', 'collect-supplies');
  await expect(proof).toHaveAttribute('data-foundation-pickups-active', '3');

  await walkToOrAcrossCellZ(page, proof, 4);
  for (const targetCellX of [-1, 0, 1, 0, -1, 0, 1, 0, -1, 0, 1]) {
    if ((await proof.getAttribute('data-proof-phase')) !== 'collect-supplies') break;
    await walkToOrAcrossCellX(page, proof, targetCellX);
  }
  await expect(proof).toHaveAttribute('data-proof-phase', 'select-block');
  await expect(proof).toHaveAttribute('data-foundation-pickups-active', '0');
  await expect(proof).toHaveAttribute('data-foundation-auto-steps', /^[1-9]\d*$/);

  await page.getByRole('button', { name: /Slot 2: Builder Block/ }).click();
  await walkForwardUntilCellZ(page, proof, 1);
  for (const face of ['FRONT', 'SIDE', 'TOP']) {
    await recenterUntilFace(page, recenter, face as 'FRONT' | 'SIDE' | 'TOP');
    await page.getByRole('button', { name: 'PLACE' }).click();
    if (face === 'FRONT') await walkToOrAcrossCellZ(page, proof, -1);
    if (face === 'SIDE') await walkBackwardUntilMinimumCellX(page, proof, 2);
  }
  await expect(proof).toHaveAttribute('data-proof-phase', 'select-tool');

  await page.getByRole('button', { name: /Slot 1: Builder/ }).click();
  await recenter.click();
  await page.waitForTimeout(300);
  await expect(page.locator('.voxel-proof-target-label')).toContainText(/INSTALLED BUILDER BLOCK/);
  await retreatFromTarget(page, proof);
  await recenter.click();
  await page.waitForTimeout(300);
  await expect(page.locator('.voxel-proof-target-label')).toContainText(/INSTALLED BUILDER BLOCK/);
  await holdActionUntil(page, mine, () =>
    expect(proof).toHaveAttribute('data-proof-phase', 'collect-repair', { timeout: 5_000 }),
  );
  await expect(proof).toHaveAttribute('data-proof-phase', 'collect-repair');
  await expect(proof).toHaveAttribute('data-foundation-pickups-active', '1');

  for (let index = 0; index < 8; index += 1) {
    if ((await proof.getAttribute('data-proof-phase')) !== 'collect-repair') break;
    await holdJoystick(page, 'forward', 300);
  }
  await expect(proof).toHaveAttribute('data-proof-phase', 'select-block');
  await expect(proof).toHaveAttribute('data-foundation-pickups-reused', '1');

  await page.getByRole('button', { name: /Slot 2: Builder Block/ }).click();
  await nudgeJoystickUntilCellChanges(page, proof, 'backward');
  await recenterUntilFace(page, recenter, 'FRONT');
  await page.getByRole('button', { name: 'PLACE' }).click();

  await expect(proof).toHaveAttribute('data-proof-phase', 'complete');
  await expect(page.getByRole('status')).toContainText('YARD REPAIR COMPLETE');
  await expect(page.locator('.voxel-proof-target-label')).toHaveCount(0);
  await expect(proof).toHaveAttribute('data-foundation-storage-writes', '0');
  await expect(proof).toHaveAttribute('data-foundation-api-requests', '0');
});

test('pause clears held movement and graphics loss stops the proof safely', async ({ page }) => {
  await page.goto('/?proof=voxel');
  const proof = page.locator('main.voxel-proof');
  await expect(proof).toHaveAttribute('data-foundation-player-cell', /^\d+,\d+,\d+$/, {
    timeout: 30_000,
  });
  const before = await proof.getAttribute('data-foundation-player-cell');

  await page.getByRole('button', { name: /PAUSE/ }).click();
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await expect(proof).toHaveAttribute('data-foundation-player-cell', before!);
  await page.getByRole('button', { name: /RESUME PROOF/ }).click();
  await page.keyboard.up('w');
  await expect(proof).toHaveAttribute('data-foundation-player-cell', before!);

  await page.locator('canvas').evaluate((canvas) => {
    const gl =
      canvas.getContext('webgl2') ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.getByRole('alertdialog')).toContainText('GRAPHICS CONTEXT LOST');
});

test('visible joystick movement stops at the full-height rail', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?proof=voxel');
  const proof = page.locator('main.voxel-proof');
  await expect(proof).toHaveAttribute('data-foundation-player-cell', /^\d+,\d+,\d+$/, {
    timeout: 30_000,
  });

  await walkBackwardUntilCellZ(page, proof, 10);
  const stoppedCell = await proof.getAttribute('data-foundation-player-cell');
  await holdJoystick(page, 'backward', 1_500);

  await expect(proof).toHaveAttribute('data-foundation-player-cell', stoppedCell!);
  await expect(proof).toHaveAttribute('data-foundation-auto-steps', '0');
});
