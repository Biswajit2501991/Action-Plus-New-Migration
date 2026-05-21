import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5501';
const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/e2e/report' }],
    ['json', { outputFile: 'tests/e2e/report/results.json' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_SKIP_WEB_SERVER
    ? undefined
    : [
        {
          command: 'npm run dev:web',
          url: `${baseURL}/index.html`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'cd backend && npm run dev',
          url: `${apiURL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
  globalSetup: './tests/e2e/global-setup.ts',
  // Phase 4: tear down accumulated e2e-staff-* test profiles + their leaves.
  globalTeardown: './tests/e2e/global-teardown.ts',
});
