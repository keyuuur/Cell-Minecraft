import { defineConfig } from '@playwright/test';
import releaseConfig from './playwright.config';

if (process.env.E2E_BASE_URL) {
  throw new Error('Development resilience routes cannot target an external deployment.');
}

export default defineConfig({
  ...releaseConfig,
  testMatch: 'mission.spec.ts',
  use: {
    ...releaseConfig.use,
    baseURL: 'http://127.0.0.1:4187',
    extraHTTPHeaders: undefined,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  outputDir: 'test-results/resilience',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-resilience' }]],
});
