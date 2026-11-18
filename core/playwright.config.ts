import { defineConfig, devices } from '@playwright/test';

import { testEnv } from '~/tests/environment';

export default defineConfig({
  testDir: './tests',
  outputDir: './.tests/test-results',
  workers: 1, // TODO: Implement parallel workers in the future
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  reporter: [
    ['list', { outputFolder: './.tests/reports/list' }],
    ['html', { outputFolder: './.tests/reports/html' }],
  ],
  use: {
    locale: testEnv.TESTS_LOCALE,
    baseURL: testEnv.PLAYWRIGHT_TEST_BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': testEnv.VERCEL_PROTECTION_BYPASS,
      'x-vercel-set-bypass-cookie': testEnv.CI.toString(),
    },
  },
  projects: [
    {
      name: 'tests-chromium',
      testIgnore: /.*\.mobile\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        // Use full Chromium; the headless shell identifies itself as a crawler
        // and BigCommerce rejects its /session-sync requests.
        channel: 'chromium',
      },
    },
    {
      name: 'tests-webkit-mobile',
      testMatch: /.*\.mobile\.spec\.ts$/,
      use: {
        ...devices['iPhone 11'],
      },
    },
  ],
  retries: 2,
});
