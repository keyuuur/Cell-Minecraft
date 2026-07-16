import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.E2E_BASE_URL;
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const projectPreviewSuffix = '-keyur159263-5904s-projects.vercel.app';

function isApprovedVercelHost(hostname: string): boolean {
  return (
    hostname === 'cell-minecraft.vercel.app' ||
    (hostname.startsWith('cell-minecraft-') && hostname.endsWith(projectPreviewSuffix))
  );
}

if (vercelBypassSecret) {
  if (!externalBaseURL) {
    throw new Error('E2E_BASE_URL is required when VERCEL_AUTOMATION_BYPASS_SECRET is set.');
  }

  const target = new URL(externalBaseURL);

  if (target.protocol !== 'https:' || !isApprovedVercelHost(target.hostname)) {
    throw new Error(
      'The Vercel automation bypass can only be sent to an approved HTTPS Cell Minecraft Vercel host.',
    );
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalBaseURL ?? 'http://127.0.0.1:4187',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4187 --strictPort',
        url: 'http://127.0.0.1:4187',
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'ipad-landscape',
      use: {
        ...devices['iPad (gen 7) landscape'],
        browserName: 'webkit',
      },
    },
  ],
});
