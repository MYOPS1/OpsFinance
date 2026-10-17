import { defineConfig, devices } from '@playwright/test';

process.env.NEXT_PUBLIC_DEMO_MODE ??= 'true';
process.env.OPSFINANCE_DEMO_MODE ??= 'true';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  retries: 0,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'small-mobile', use: { ...devices['Pixel 5'] } },
    { name: 'iphone', use: { ...devices['iPhone 12'] } },
    { name: 'tablet', use: { ...devices['Galaxy Tab S4'] } },
  ],
  webServer: {
    command: 'npm run dev',
    env: {
      NEXT_PUBLIC_DEMO_MODE: 'true',
      OPSFINANCE_DEMO_MODE: 'true',
    },
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
