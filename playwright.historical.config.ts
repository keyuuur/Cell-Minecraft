import { defineConfig } from '@playwright/test';
import currentConfig from './playwright.dev.config';

export default defineConfig({
  ...currentConfig,
  testMatch: ['boundary-slice.spec.ts', 'structure-slice.spec.ts', 'voxel-foundation.spec.ts'],
  outputDir: 'test-results/historical-proofs',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-historical' }]],
});
