import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'phase4-built-performance-a11y.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // The visible-control route deliberately waits for semantic feedback after
  // every movement and action. Keep its harness ceiling separate from the
  // game's 15 active-minute classroom timer and the 10-second startup gate.
  timeout: 1_800_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-phase4' }]],
  outputDir: 'test-results/phase4-audit',
  use: {
    baseURL: 'http://127.0.0.1:4194',
    trace: 'retain-on-failure',
    screenshot: 'off',
    reducedMotion: 'reduce',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4194 --strictPort',
    url: 'http://127.0.0.1:4194',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-standard',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 1,
        hasTouch: true,
      },
    },
    {
      name: 'webkit-low',
      use: {
        ...devices['iPad (gen 7) landscape'],
        browserName: 'webkit',
        viewport: { width: 1024, height: 680 },
        deviceScaleFactor: 2,
        hasTouch: true,
      },
    },
  ],
});
