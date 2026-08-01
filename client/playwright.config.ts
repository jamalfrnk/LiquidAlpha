import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium-only by design (mission's own tradeoff): a single browser project
 * keeps this bounded rather than multiplying run time across engines for a
 * smoke-level suite. Runs against the Vite dev server so it doesn't need a
 * production build or a running API server to exercise the guest-visible
 * sign-in screen.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
