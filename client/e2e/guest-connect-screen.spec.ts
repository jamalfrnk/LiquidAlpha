import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke coverage for the one screen every visitor sees before any wallet or
 * backend involvement: `/api/auth/me` fails (no server needed for this
 * test -- `retry: false`/`throwOnError: false` in AuthProvider means that
 * resolves to "not logged in", not a hang), so the app renders ConnectScreen.
 * Deeper wallet-lifecycle and paper-order flows are WALLET-001/AUTH-GUEST-001's
 * own test-writing responsibility, once those features exist to test.
 */
test.describe('Guest-visible connect screen', () => {
  test('loads without unexpected console errors and shows the wallet sign-in entry point', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // The browser itself logs any non-2xx network response at
      // console-error level -- a guest's unauthenticated `/api/auth/me`
      // check resolving 401 is expected, correct behavior (see
      // AuthProvider's `throwOnError: false`), not a bug to flag here.
      if (/Failed to load resource.*401/.test(msg.text())) return;
      consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: /sign in with your wallet/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('has no serious or critical automated accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrWorse = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

    expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
  });
});
