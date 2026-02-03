import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Pinecone Explorer E2E tests
 * Testing Electron application with metadata filtering across providers
 */
export default defineConfig({
  testDir: './e2e',

  // Maximum time one test can run
  timeout: 60 * 1000,

  // Test execution settings
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Electron apps run better with single worker

  // Reporting
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],

  // Output
  use: {
    // Base URL for any relative URLs
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Test output directories
  outputDir: 'test-results/',

  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
