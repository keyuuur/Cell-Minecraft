import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.E2E_BASE_URL;
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const expectedCommitSha = process.env.E2E_EXPECTED_SHA;
const projectPreviewSuffix = '-keyur159263-5904s-projects.vercel.app';
const productionHostname = 'cell-minecraft.vercel.app';

function isApprovedVercelHost(hostname: string): boolean {
  return (
    hostname !== productionHostname &&
    hostname.startsWith('cell-minecraft-') &&
    hostname.endsWith(projectPreviewSuffix)
  );
}

if (externalBaseURL) {
  const target = new URL(externalBaseURL);
  if (target.protocol !== 'https:' || !isApprovedVercelHost(target.hostname)) {
    throw new Error(
      'External browser tests can only target an approved HTTPS Cell Minecraft Preview host; Production is forbidden.',
    );
  }
  if (!/^[0-9a-f]{40}$/i.test(expectedCommitSha ?? '')) {
    throw new Error('E2E_EXPECTED_SHA must identify the exact Preview commit.');
  }
}

if (vercelBypassSecret && !externalBaseURL) {
  throw new Error('E2E_BASE_URL is required when VERCEL_AUTOMATION_BYPASS_SECRET is set.');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'mission-black-box.spec.ts',
  // The built-performance route has its own long-running config, exact build
  // provenance contract, and project names. Running it under this ordinary
  // matrix produces invalid duplicate evidence and can exhaust a CI runner.
  testIgnore: 'phase4-built-performance-a11y.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalBaseURL ?? 'http://127.0.0.1:4187',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: vercelBypassSecret
      ? {
          'x-vercel-protection-bypass': vercelBypassSecret,
          'x-vercel-set-bypass-cookie': 'true',
        }
      : undefined,
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1 --port 4187 --strictPort',
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
