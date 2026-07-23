import { defineConfig, devices } from '@playwright/test';
import currentConfig from './playwright.dev.config';

export default defineConfig({
  ...currentConfig,
  testMatch: 'voxel-mission.spec.ts',
  // Each route owns a fresh worker so the two long traced journeys can close
  // their browser explicitly without affecting the remaining mechanics gates.
  projects: [
    {
      name: 'mechanics-coordinate-chromium',
      grep: /@mechanics-coordinate/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mechanics-context-loss-chromium',
      grep: /@mechanics-context-loss/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mechanics-classroom-chromium',
      grep: /@mechanics-classroom/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mechanics-coordinate-webkit',
      grep: /@mechanics-coordinate/,
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'webkit' },
    },
    {
      name: 'mechanics-context-loss-webkit',
      grep: /@mechanics-context-loss/,
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'webkit' },
    },
    {
      name: 'mechanics-classroom-webkit',
      grep: /@mechanics-classroom/,
      use: { ...devices['iPad (gen 7) landscape'], browserName: 'webkit' },
    },
  ],
  outputDir: 'test-results/mechanics',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-mechanics' }]],
});
