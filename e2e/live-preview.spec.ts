import { expect, test } from '@playwright/test';

const externalBaseURL = process.env.E2E_BASE_URL;
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to an accessible deployed preview.');
test.use({ trace: 'off' });

test('@live preview supports the production-safe student startup flow', async ({ page }) => {
  if (vercelBypassSecret && externalBaseURL) {
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
  }

  await page.goto('/?test=1');
  await page.getByLabel('First name').fill('Preview');
  await page.getByLabel('Last initial').fill('P');
  await page.getByLabel('Class period').selectOption('1');
  await page.getByRole('button', { name: 'Continue to controls' }).click();

  const arena = page.getByLabel('Untimed control practice arena');
  await arena.focus();
  await page.keyboard.press('d');
  await page.keyboard.press('d');
  await page.keyboard.press('d');
  await page.keyboard.press('w');
  await page.getByRole('button', { name: 'Interact' }).click();
  await arena.focus();
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press('d');
    await page.keyboard.press('w');
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

  await page.getByRole('button', { name: 'Start mission and timer' }).click();
  await expect(page.getByLabel('Mission controls')).toBeVisible();
  await expect(page.locator('canvas.game-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Advance test stage' })).toHaveCount(0);
  await expect(page.getByText(/TEST MODE/)).toHaveCount(0);
  await expect(page.getByText('Place wall panels outside the cell (0/6).')).toBeVisible();
});
