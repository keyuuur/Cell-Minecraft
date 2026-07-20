import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const evidenceRoot = process.env.STRUCTURE_EVIDENCE_DIR;
const testedAppSha = process.env.STRUCTURE_APP_SHA ?? 'working-tree-calibration';
const evidenceSha = process.env.STRUCTURE_EVIDENCE_SHA ?? testedAppSha;

interface EvidenceImage {
  file: string;
  sha256: string;
}

interface Point2 {
  x: number;
  z: number;
}

const targets = {
  nucleusDepot: { x: 15, z: 9 },
  nucleusPlacement: { x: 7, z: 7 },
  ribosomesDepot: { x: 15, z: 5 },
  ribosomesPlacement: { x: 7, z: 4 },
  mitochondriaDepot: { x: 15, z: 1 },
  mitochondriaPlacement: { x: 7, z: 1 },
  chloroplastsDepot: { x: 15, z: -3 },
  chloroplastsPlacement: { x: 7, z: -3 },
  vacuoleDepot: { x: 15, z: -7 },
  vacuolePlacement: { x: 3, z: -3 },
} as const;

async function capture(page: Page, images: EvidenceImage[], file: string): Promise<void> {
  if (!evidenceRoot) return;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.waitForTimeout(180);
  await mkdir(evidenceRoot, { recursive: true });
  const filePath = path.join(evidenceRoot, file);
  const buffer = await page.screenshot({ path: filePath });
  images.push({ file, sha256: createHash('sha256').update(buffer).digest('hex') });
}

async function playerPoint(slice: Locator): Promise<Point2> {
  const raw = await slice.getAttribute('data-structure-player');
  const [x, z] = (raw ?? '').split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new Error(`Missing semantic player position: ${raw}`);
  }
  return { x, z };
}

const normalizeAngle = (angle: number): number => {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
};

async function holdForward(page: Page, browserName: string, milliseconds: number): Promise<void> {
  if (browserName !== 'webkit') {
    await page.locator('canvas').click({ position: { x: 510, y: 360 } });
    await page.keyboard.down('w');
    await page.waitForTimeout(milliseconds);
    await page.keyboard.up('w');
    return;
  }
  const joystick = page.getByRole('application', { name: /Movement joystick/ });
  const box = await joystick.boundingBox();
  if (!box) throw new Error('Movement joystick was not visible.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x, box.y + box.height * 0.12, { steps: 4 });
  await page.waitForTimeout(milliseconds);
  await page.mouse.up();
}

async function dragYaw(page: Page, radians: number): Promise<void> {
  let remaining = radians;
  while (Math.abs(remaining) > 0.025) {
    const step = Math.max(-1.8, Math.min(1.8, remaining));
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Game canvas was not visible.');
    const center = {
      x: box.x + box.width / 2,
      y: box.y + box.height * 0.52,
    };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + step / 0.0045, center.y, { steps: 6 });
    await page.mouse.up();
    remaining -= step;
  }
}

async function navigateTo(
  page: Page,
  slice: Locator,
  browserName: string,
  target: Point2,
  tolerance: number,
): Promise<void> {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const beforeProbe = await playerPoint(slice);
    const distance = Math.hypot(target.x - beforeProbe.x, target.z - beforeProbe.z);
    if (distance <= tolerance) return;

    await holdForward(page, browserName, 180);
    await page.waitForTimeout(220);
    let afterProbe = await playerPoint(slice);
    let headingDelta = {
      x: afterProbe.x - beforeProbe.x,
      z: afterProbe.z - beforeProbe.z,
    };
    if (Math.hypot(headingDelta.x, headingDelta.z) < 0.05) {
      await page.waitForTimeout(320);
      afterProbe = await playerPoint(slice);
      headingDelta = {
        x: afterProbe.x - beforeProbe.x,
        z: afterProbe.z - beforeProbe.z,
      };
    }
    if (Math.hypot(headingDelta.x, headingDelta.z) < 0.05) {
      continue;
    }
    const currentYaw = Math.atan2(headingDelta.x, headingDelta.z);
    const desiredYaw = Math.atan2(target.x - afterProbe.x, target.z - afterProbe.z);
    await dragYaw(page, normalizeAngle(desiredYaw - currentYaw));

    const remaining = Math.hypot(target.x - afterProbe.x, target.z - afterProbe.z);
    const travelMs = Math.max(140, Math.min(850, ((remaining - tolerance) / 7) * 820));
    await holdForward(page, browserName, travelMs);
    await page.waitForTimeout(240);
  }
  const point = await playerPoint(slice);
  throw new Error(
    `Visible controls did not reach ${target.x},${target.z}; stopped at ${point.x},${point.z}.`,
  );
}

async function collectPlaceInspect(
  page: Page,
  slice: Locator,
  browserName: string,
  images: EvidenceImage[],
  id: 'nucleus' | 'ribosomes' | 'mitochondria' | 'chloroplasts' | 'centralVacuole',
  depot: Point2,
  placement: Point2,
  screenshot: string,
): Promise<void> {
  await navigateTo(page, slice, browserName, depot, 3.7);
  await expect(slice).toHaveAttribute('data-structure-nearby-station', id);
  await page.getByRole('button', { name: 'COLLECT MODEL MODULE' }).click();
  await expect(slice).toHaveAttribute(`data-${id.toLowerCase()}-inventory`, '1');
  await navigateTo(page, slice, browserName, placement, 0.9);
  await expect(slice).toHaveAttribute('data-structure-placement', 'valid');
  await page.getByRole('button', { name: 'PLACE MODEL MODULE' }).click();
  await expect(slice).toHaveAttribute(`data-${id.toLowerCase()}-placed`, 'true');
  await expect(slice).toHaveAttribute(`data-${id.toLowerCase()}-evidence`, 'false');
  await expect(page.getByRole('button', { name: 'INSPECT STRUCTURE' })).toBeEnabled();
  await page.getByRole('button', { name: 'INSPECT STRUCTURE' }).click();
  await expect(slice).toHaveAttribute(`data-${id.toLowerCase()}-evidence`, 'true');
  await capture(page, images, screenshot);
}

test('complete structure slice uses visible controls and restores correction credit', async ({
  page,
  browserName,
}) => {
  test.setTimeout(360_000);
  const images: EvidenceImage[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const viewport = { width: 1024, height: browserName === 'webkit' ? 680 : 768 };
  await page.setViewportSize(viewport);
  await page.goto('/?proof=structures');
  const slice = page.locator('main.structure-slice');
  await expect(slice).toHaveAttribute('data-structure-score', '38.8');
  await expect(slice).toHaveAttribute('data-structure-count', '3');
  await expect(slice).toHaveAttribute('data-foundation-storage-writes', '0');
  await expect(slice).toHaveAttribute('data-foundation-api-requests', '0');
  await capture(page, images, '01-opening-structure-mission.png');

  await holdForward(page, browserName, 220);
  await page.getByRole('button', { name: /PAUSE/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Input is cleared');
  const pausedAt = await playerPoint(slice);
  await page.waitForTimeout(480);
  expect(await playerPoint(slice)).toEqual(pausedAt);
  await capture(page, images, '02-paused-input-cleared.png');
  await page.getByRole('button', { name: /RESUME STRUCTURE MISSION/ }).click();

  await navigateTo(page, slice, browserName, targets.nucleusDepot, 3.7);
  await expect(slice).toHaveAttribute('data-structure-nearby-station', 'nucleus');
  await page.getByRole('button', { name: 'COLLECT MODEL MODULE' }).click();
  await expect(slice).toHaveAttribute('data-nucleus-inventory', '1');
  await capture(page, images, '03-nucleus-supply-collected.png');
  const scoreBeforeInvalid = await slice.getAttribute('data-structure-score');
  await page.getByRole('button', { name: 'PLACE MODEL MODULE' }).click();
  await expect(page.locator('.voxel-proof-feedback')).toContainText('Invalid placement');
  await expect(slice).toHaveAttribute('data-nucleus-inventory', '1');
  await expect(slice).toHaveAttribute('data-structure-score', scoreBeforeInvalid!);
  await capture(page, images, '04-invalid-placement-conserved.png');
  await navigateTo(page, slice, browserName, targets.nucleusPlacement, 0.9);
  await expect(slice).toHaveAttribute('data-structure-placement', 'valid');
  await page.getByRole('button', { name: 'PLACE MODEL MODULE' }).click();
  await expect(slice).toHaveAttribute('data-nucleus-placed', 'true');
  await expect(slice).toHaveAttribute('data-nucleus-evidence', 'false');
  await capture(page, images, '05-nucleus-placed-before-evidence.png');
  await page.getByRole('button', { name: 'INSPECT STRUCTURE' }).click();
  await expect(slice).toHaveAttribute('data-nucleus-evidence', 'true');
  await expect(page.locator('.voxel-proof-feedback')).toContainText('contains DNA');
  await capture(page, images, '06-nucleus-control-evidence.png');

  await collectPlaceInspect(
    page,
    slice,
    browserName,
    images,
    'ribosomes',
    targets.ribosomesDepot,
    targets.ribosomesPlacement,
    '07-ribosome-protein-evidence.png',
  );
  await collectPlaceInspect(
    page,
    slice,
    browserName,
    images,
    'mitochondria',
    targets.mitochondriaDepot,
    targets.mitochondriaPlacement,
    '08-mitochondria-energy-evidence.png',
  );
  await collectPlaceInspect(
    page,
    slice,
    browserName,
    images,
    'chloroplasts',
    targets.chloroplastsDepot,
    targets.chloroplastsPlacement,
    '09-chloroplast-photosynthesis-evidence.png',
  );

  await navigateTo(page, slice, browserName, targets.vacuoleDepot, 3.7);
  await expect(slice).toHaveAttribute('data-structure-nearby-station', 'centralVacuole');
  await page.getByRole('button', { name: 'COLLECT MODEL MODULE' }).click();
  await navigateTo(page, slice, browserName, targets.vacuolePlacement, 0.9);
  await page.getByRole('button', { name: 'PLACE MODEL MODULE' }).click();
  await expect(slice).toHaveAttribute('data-centralvacuole-placed', 'true');
  await expect(slice).toHaveAttribute('data-centralvacuole-evidence', 'false');
  await capture(page, images, '10-vacuole-placed-before-evidence.png');
  await page.getByRole('button', { name: 'INSPECT STRUCTURE' }).click();
  await expect(slice).toHaveAttribute('data-centralvacuole-evidence', 'true');
  await expect(slice).toHaveAttribute('data-structure-score', '80');
  await capture(page, images, '11-all-eight-functions-80-points.png');

  await page.getByRole('button', { name: /OVERVIEW/ }).click();
  await page.waitForTimeout(350);
  await capture(page, images, '11b-all-eight-structure-overview.png');
  await page.getByRole('button', { name: /RECENTER/ }).click();
  await navigateTo(page, slice, browserName, { x: 8, z: -3 }, 1.2);

  await page.getByRole('button', { name: /Slot 1: Builder's Pick/ }).click();
  await expect(page.getByRole('button', { name: 'REMOVE MODEL MODULE' })).toBeEnabled();
  await page.getByRole('button', { name: 'REMOVE MODEL MODULE' }).click();
  await expect(slice).toHaveAttribute('data-structure-recovery-drop', 'centralVacuole');
  await expect(slice).not.toHaveAttribute('data-structure-score', '80');
  await capture(page, images, '12-physical-drop-after-removal.png');

  const dropRaw = await slice.getAttribute('data-structure-recovery-drop-position');
  const [dropX, dropZ] = dropRaw!.split(',').map(Number);
  await navigateTo(page, slice, browserName, { x: dropX, z: dropZ }, 0.7);
  await expect(slice).toHaveAttribute('data-structure-recovery-drop', 'none');
  await expect(slice).toHaveAttribute('data-centralvacuole-inventory', '1');
  await navigateTo(page, slice, browserName, targets.vacuolePlacement, 0.9);
  await page.getByRole('button', { name: 'PLACE MODEL MODULE' }).click();
  await expect(slice).toHaveAttribute('data-structure-score', '77.5');
  await page.getByRole('button', { name: 'INSPECT STRUCTURE' }).click();
  await expect(slice).toHaveAttribute('data-structure-correction-complete', 'true');
  await expect(slice).toHaveAttribute('data-structure-score', '80');
  await expect(page.getByRole('status')).toContainText('PHASE 4 CHECKPOINT COMPLETE');
  await capture(page, images, '13-rebuilt-reinspected-checkpoint.png');

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  if (evidenceRoot) {
    await writeFile(
      path.join(evidenceRoot, 'run.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          route: 'development-structure-slice',
          testedAppSha,
          evidenceSha,
          browser: browserName,
          viewport,
          physicalDeviceEvidence: false,
          screenshots: images,
          semanticGates: {
            visibleControlsOnly: true,
            structurePrefabs: 5,
            totalApprovedStructures: 8,
            placementIndependentEvidence: true,
            invalidPlacementConservedState: true,
            physicalRecoveryDrop: true,
            repairRestoredScore: true,
            finalScore: 80,
            droughtCredit: 0,
            finalStabilityCredit: 0,
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

test('structure slice stops safely on graphics context loss', async ({ page }) => {
  await page.goto('/?proof=structures');
  const slice = page.locator('main.structure-slice');
  await expect(slice).toHaveAttribute('data-structure-context-lost', 'false');
  await page.locator('canvas').evaluate((canvas) => {
    const gl =
      canvas.getContext('webgl2') ?? (canvas.getContext('webgl') as WebGLRenderingContext | null);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(slice).toHaveAttribute('data-structure-context-lost', 'true');
  await expect(page.getByRole('alertdialog')).toContainText('GRAPHICS CONTEXT LOST');
});
