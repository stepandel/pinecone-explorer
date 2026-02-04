import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Pinecone Explorer E2E tests
 * Testing Electron application with metadata filtering across providers
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',

  /* Maximum time one test can run for */
  timeout: 60_000,

  /* Run tests in files in serial */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Single worker for serial execution to avoid conflicts */
  workers: 1,

  /* Reporter to use */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Capture screenshot only on failure */
    screenshot: 'only-on-failure',

    /* Capture video only when retaining on failure */
    video: 'retain-on-failure',
  },

  /* Test output directories */
  outputDir: 'test-results/',

  /* Configure projects for major browsers - not needed for Electron but kept for future web testing */
  projects: [
    {
      name: 'electron',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
