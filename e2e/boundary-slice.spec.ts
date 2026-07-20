import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const evidenceRoot = process.env.BOUNDARY_EVIDENCE_DIR;

interface EvidenceImage {
  file: string;
  sha256: string;
}

async function capture(page: Page, images: EvidenceImage[], file: string): Promise<void> {
  if (!evidenceRoot) return;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.waitForTimeout(120);
  await mkdir(evidenceRoot, { recursive: true });
  const filePath = path.join(evidenceRoot, file);
  const buffer = await page.screenshot({ path: filePath });
  images.push({ file, sha256: createHash('sha256').update(buffer).digest('hex') });
}

async function holdActionUntil(
  page: Page,
  button: Locator,
  completed: () => Promise<void>,
): Promise<void> {
  const box = await button.boundingBox();
  if (!box) throw new Error('Context action was not visible.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  let dispatchedTouchPointer = false;
  try {
    try {
      await expect(page.locator('main.boundary-slice')).toHaveAttribute(
        'data-boundary-action-held',
        'true',
        { timeout: 800 },
      );
    } catch {
      // Playwright WebKit exposes tap but no native touch-hold primitive. If
      // its emulated mouse pointer is ignored, send a PointerEvent to the same
      // visible, hit-tested button rather than reaching into gameplay state.
      await page.mouse.up();
      await button.dispatchEvent('pointerdown', {
        pointerId: 41,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
      });
      dispatchedTouchPointer = true;
      await expect(page.locator('main.boundary-slice')).toHaveAttribute(
        'data-boundary-action-held',
        'true',
      );
    }
    await completed();
  } finally {
    if (dispatchedTouchPointer) {
      await button.dispatchEvent('pointerup', {
        pointerId: 41,
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

async function holdJoystick(
  page: Page,
  direction: 'forward' | 'backward',
  milliseconds = 220,
): Promise<void> {
  const joystick = page.getByRole('application', { name: /Movement joystick/ });
  const box = await joystick.boundingBox();
  if (!box) throw new Error('Movement joystick was not visible.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const destination = {
    x: center.x,
    y: box.y + box.height * (direction === 'forward' ? 0.12 : 0.88),
  };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 4 });
  await page.waitForTimeout(milliseconds);
  await page.mouse.up();
  await page.waitForTimeout(100);
}

async function approachUntil(
  page: Page,
  recenter: Locator,
  condition: () => Promise<void>,
  maximumPulses = 60,
): Promise<void> {
  for (let pulse = 0; pulse < maximumPulses; pulse += 1) {
    await recenter.click();
    try {
      await condition();
      return;
    } catch {
      // A 100 ms touch pulse can fall between render samples on slower WebKit
      // emulation. Keep the visible joystick engaged long enough for multiple
      // game-loop frames without moving a full two-cell stride.
      await holdJoystick(page, 'forward', 240);
    }
  }
  // A low-frame-rate pulse can carry the emulated player through a one-cell
  // bracket. Use the rollout's single allowed recenter-and-rescan retry:
  // visibly back away, reacquire the same target, and approach with shorter
  // joystick pulses.
  await recenter.click();
  await holdJoystick(page, 'backward', 420);
  for (let pulse = 0; pulse < 24; pulse += 1) {
    await recenter.click();
    try {
      await condition();
      return;
    } catch {
      await holdJoystick(page, 'forward', 140);
    }
  }
  const slice = page.locator('main.boundary-slice');
  throw new Error(
    `Visible movement did not reach the recentered target. phase=${await slice.getAttribute(
      'data-boundary-phase',
    )} active=${await slice.getAttribute(
      'data-boundary-active-sector',
    )} player=${await slice.getAttribute(
      'data-foundation-player-cell',
    )} hit=${await slice.getAttribute(
      'data-foundation-target-cell',
    )} face=${await slice.getAttribute(
      'data-foundation-target-face',
    )} adjacent=${await slice.getAttribute(
      'data-foundation-adjacent-cell',
    )} failure=${await slice.getAttribute('data-boundary-placement-failure')}`,
  );
}

async function retreatTwoCells(page: Page, slice: Locator, recenter: Locator): Promise<void> {
  await recenter.click();
  const initial = (await slice.getAttribute('data-foundation-player-cell')) ?? '';
  const [initialX, , initialZ] = initial.split(',').map(Number);
  for (let pulse = 0; pulse < 10; pulse += 1) {
    await holdJoystick(page, 'backward', 180);
    const current = (await slice.getAttribute('data-foundation-player-cell')) ?? '';
    const [x, , z] = current.split(',').map(Number);
    if (
      [initialX, initialZ, x, z].every(Number.isFinite) &&
      Math.hypot(x - initialX, z - initialZ) >= 2
    ) {
      return;
    }
  }
  throw new Error('Visible joystick retreat did not cross two grid cells.');
}

test('boundary slice completes through real controls with correction and score restoration', async ({
  page,
  browserName,
}) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const images: EvidenceImage[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.setViewportSize({
    width: 1024,
    height: browserName === 'webkit' ? 680 : 768,
  });
  await page.goto('/?proof=boundary');
  const slice = page.locator('main.boundary-slice');
  const recenter = page.getByRole('button', { name: /RECENTER/ });
  const contextAction = page.locator('.boundary-context-action');
  const place = page.getByRole('button', { name: 'PLACE MODEL MODULE' });

  await expect(slice).toHaveAttribute('data-boundary-phase', 'mine-wall-supply');
  await expect(slice).toHaveAttribute('data-foundation-world', '24x12x24');
  await expect(slice).toHaveAttribute('data-boundary-cytoplasm-solid-cells', '0');
  await recenter.click();
  await expect(page.locator('.voxel-proof-target-label')).toContainText('WALL SUPPLY', {
    timeout: 5_000,
  });
  await page.waitForTimeout(300);
  await capture(page, images, '01-opening-cutaway-wall-supply.png');

  await recenter.click();
  await expect(contextAction).toHaveAttribute('aria-label', 'HOLD MINE');
  await holdActionUntil(page, contextAction, () =>
    expect(slice).toHaveAttribute('data-boundary-phase', 'collect-wall-stack', {
      timeout: 5_000,
    }),
  );
  await expect(slice).toHaveAttribute('data-foundation-pickups-active', '1');
  await expect(page.locator('.voxel-proof-feedback')).toContainText(
    'Wall Module stack x6 released',
  );
  await capture(page, images, '02-wall-stack-physical-drop.png');

  await approachUntil(page, recenter, () =>
    expect(slice).toHaveAttribute('data-boundary-phase', 'select-wall', { timeout: 250 }),
  );
  await expect(slice).toHaveAttribute('data-boundary-wall-inventory', '6');
  await page.getByRole('button', { name: /Slot 2: Cell Wall Model Module/ }).click();

  const scoreBeforeInvalid = await slice.getAttribute('data-boundary-score');
  await place.click();
  await expect(page.locator('.voxel-proof-feedback')).toContainText('Invalid placement');
  await expect(slice).toHaveAttribute('data-boundary-wall-inventory', '6');
  await expect(slice).toHaveAttribute('data-boundary-score', scoreBeforeInvalid!);
  await capture(page, images, '03-invalid-wall-unchanged.png');

  for (let index = 0; index < 6; index += 1) {
    await approachUntil(page, recenter, () =>
      expect(page.locator('.voxel-proof-target-label')).toContainText('VALID OUTER WALL', {
        timeout: 250,
      }),
    );
    await place.click();
    await expect(slice).toHaveAttribute('data-boundary-wall-count', String(index + 1));
    if (index === 0 || index === 2) {
      await approachUntil(page, recenter, () =>
        expect(page.locator('.voxel-proof-target-label')).toContainText('VALID OUTER WALL', {
          timeout: 250,
        }),
      );
      await capture(
        page,
        images,
        index === 0 ? '04-valid-outer-wall-1-of-6.png' : '05-cumulative-outer-wall-3-of-6.png',
      );
    }
  }
  await expect(slice).toHaveAttribute('data-boundary-phase', 'inspect-wall');
  await approachUntil(page, recenter, () =>
    expect(page.locator('.voxel-proof-target-label')).toContainText('CELL WALL SUPPORT', {
      timeout: 250,
    }),
  );
  await contextAction.click();
  await expect(slice).toHaveAttribute('data-boundary-wall-evidence', 'true');
  await expect(slice).toHaveAttribute('data-boundary-target-label', '');
  await capture(page, images, '06-outer-wall-support-check.png');

  await page.getByRole('button', { name: /Slot 1: Builder/ }).click();
  await approachUntil(page, recenter, () =>
    expect(page.locator('.voxel-proof-target-label')).toContainText('MEMBRANE SUPPLY', {
      timeout: 250,
    }),
  );
  await holdActionUntil(page, contextAction, () =>
    expect(slice).toHaveAttribute('data-boundary-phase', 'collect-membrane-stack', {
      timeout: 5_000,
    }),
  );
  await expect(page.locator('.voxel-proof-feedback')).toContainText(
    'Membrane Module stack x6 released',
  );
  await approachUntil(page, recenter, () =>
    expect(slice).toHaveAttribute('data-boundary-phase', 'select-membrane', { timeout: 250 }),
  );
  await page.getByRole('button', { name: /Slot 3: Cell Membrane Model Module/ }).click();

  const membraneScoreBeforeInvalid = await slice.getAttribute('data-boundary-score');
  await place.click();
  await expect(page.locator('.voxel-proof-feedback')).toContainText('Invalid placement');
  await expect(slice).toHaveAttribute('data-boundary-membrane-inventory', '6');
  await expect(slice).toHaveAttribute('data-boundary-score', membraneScoreBeforeInvalid!);
  await capture(page, images, '07-invalid-membrane-unchanged.png');

  for (let index = 0; index < 6; index += 1) {
    await approachUntil(page, recenter, () =>
      expect(page.locator('.voxel-proof-target-label')).toContainText('VALID INNER MEMBRANE', {
        timeout: 250,
      }),
    );
    await place.click();
    await expect(slice).toHaveAttribute('data-boundary-membrane-count', String(index + 1));
    if (index === 0) {
      await approachUntil(page, recenter, () =>
        expect(page.locator('.voxel-proof-target-label')).toContainText('VALID INNER MEMBRANE', {
          timeout: 250,
        }),
      );
      await capture(page, images, '08-wall-outside-first-inner-membrane.png');
    }
  }
  await expect(slice).toHaveAttribute('data-boundary-phase', 'inspect-membrane');
  await approachUntil(page, recenter, () =>
    expect(page.locator('.voxel-proof-target-label')).toContainText('MEMBRANE MOVEMENT CONTROL', {
      timeout: 250,
    }),
  );
  await contextAction.click();
  await expect(slice).toHaveAttribute('data-boundary-membrane-evidence', 'true');
  await expect(contextAction).toHaveAttribute('aria-label', 'ACTIVATE');
  await expect(slice).toHaveAttribute('data-boundary-target-label', '');
  await capture(page, images, '09-inner-membrane-movement-control.png');

  const completeBoundaryScore = await slice.getAttribute('data-boundary-score');
  await page.getByRole('button', { name: /Slot 1: Builder/ }).click();
  await approachUntil(page, recenter, () =>
    expect(page.locator('.voxel-proof-target-label')).toContainText('HOLD REMOVE', {
      timeout: 250,
    }),
  );
  await holdActionUntil(page, contextAction, () =>
    expect(slice).toHaveAttribute('data-boundary-phase', 'collect-repair', {
      timeout: 5_000,
    }),
  );
  await expect(slice).toHaveAttribute('data-boundary-membrane-count', '5');
  await expect(slice).not.toHaveAttribute('data-boundary-score', completeBoundaryScore!);
  await expect(slice).toHaveAttribute('data-foundation-pickups-active', '1');
  await expect(page.locator('.voxel-proof-feedback')).toContainText('Model module removed');
  await capture(page, images, '10-removed-gap-physical-drop.png');

  await approachUntil(page, recenter, () =>
    expect(slice).toHaveAttribute('data-boundary-phase', 'repair-module', { timeout: 250 }),
  );
  await page.getByRole('button', { name: /Slot 3: Cell Membrane Model Module/ }).click();
  await retreatTwoCells(page, slice, recenter);
  await approachUntil(page, recenter, () =>
    expect(page.locator('.voxel-proof-target-label')).toContainText('VALID INNER MEMBRANE', {
      timeout: 250,
    }),
  );
  await place.click();
  await expect(slice).toHaveAttribute('data-boundary-phase', 'reinspect-module');
  await approachUntil(page, recenter, () =>
    expect(page.locator('.voxel-proof-target-label')).toContainText('MEMBRANE MOVEMENT CONTROL', {
      timeout: 250,
    }),
  );
  await contextAction.click();
  await expect(slice).toHaveAttribute('data-boundary-score', completeBoundaryScore!);
  await expect(slice).toHaveAttribute('data-boundary-membrane-evidence', 'true');
  await expect(slice).toHaveAttribute('data-boundary-target-label', '');
  await capture(page, images, '11-rebuilt-reinspected-score-restored.png');

  await approachUntil(page, recenter, () =>
    expect(page.locator('.voxel-proof-target-label')).toContainText('CYTOPLASM CONTROL', {
      timeout: 250,
    }),
  );
  await retreatTwoCells(page, slice, recenter);
  await approachUntil(page, recenter, () =>
    expect(page.locator('.voxel-proof-target-label')).toContainText('CYTOPLASM CONTROL', {
      timeout: 250,
    }),
  );
  await capture(page, images, '12a-empty-interior-before-cytoplasm.png');
  await contextAction.click();
  await expect(slice).toHaveAttribute('data-boundary-cytoplasm', 'filled');
  await expect(slice).toHaveAttribute('data-boundary-cytoplasm-solid-cells', '0');
  await capture(page, images, '12b-non-solid-cytoplasm-fill.png');
  await expect(slice).toHaveAttribute('data-boundary-phase', 'inspect-cytoplasm');
  await contextAction.click();
  await expect(slice).toHaveAttribute('data-boundary-phase', 'complete');
  await expect(slice).toHaveAttribute('data-boundary-score', '38.8');
  await expect(page.getByRole('status')).toContainText('BOUNDARY CHECKPOINT COMPLETE');
  await expect(slice).toHaveAttribute('data-boundary-target-label', '');
  await expect(slice).toHaveAttribute('data-foundation-storage-writes', '0');
  await expect(slice).toHaveAttribute('data-foundation-api-requests', '0');
  await capture(page, images, '13-boundary-checkpoint-complete.png');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  if (evidenceRoot) {
    await writeFile(
      path.join(evidenceRoot, 'run.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          route: 'development-boundary-slice',
          browser: browserName,
          viewport: { width: 1024, height: browserName === 'webkit' ? 680 : 768 },
          physicalDeviceEvidence: false,
          screenshots: images,
          semanticGates: {
            visibleControlsOnly: true,
            pairedWallAndMembrane: true,
            invalidConservedState: true,
            repairRestoredScore: true,
            cytoplasmSolidCells: 0,
            finalScore: 38.8,
            storageWrites: 0,
            apiRequests: 0,
            pageErrors: 0,
            consoleErrors: 0,
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
});

test('boundary slice clears held input on pause and stops on graphics loss', async ({ page }) => {
  await page.goto('/?proof=boundary');
  const slice = page.locator('main.boundary-slice');
  await expect(slice).toHaveAttribute('data-foundation-player-cell', /^-?\d+,\d+,-?\d+$/);
  const before = await slice.getAttribute('data-foundation-player-cell');

  await page.getByRole('button', { name: /PAUSE/ }).click();
  await page.keyboard.down('w');
  await page.waitForTimeout(650);
  await expect(slice).toHaveAttribute('data-foundation-player-cell', before!);
  await page.getByRole('button', { name: /RESUME BOUNDARY SLICE/ }).click();
  await page.keyboard.up('w');
  await expect(slice).toHaveAttribute('data-foundation-player-cell', before!);

  await page.locator('canvas').evaluate((canvas) => {
    const gl =
      canvas.getContext('webgl2') ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.getByRole('alertdialog')).toContainText('GRAPHICS CONTEXT LOST');
});
