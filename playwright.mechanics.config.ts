import { defineConfig } from '@playwright/test';
import currentConfig from './playwright.dev.config';

export default defineConfig({
  ...currentConfig,
  testMatch: 'voxel-mission.spec.ts',
  outputDir: 'test-results/mechanics',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-mechanics' }]],
});
