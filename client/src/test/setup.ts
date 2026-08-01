import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's auto-cleanup only self-registers when it detects Jest/Vitest
// *globals* -- this config deliberately doesn't set `test.globals: true`
// (keeps `describe`/`it`/`expect` explicit imports everywhere, matching the
// server package's vitest style), so cleanup has to be wired up by hand.
// Without this, a component that portals into document.body (e.g.
// MobileNavDrawer's Radix Dialog) leaks across tests and later assertions
// see duplicate elements from a previous test's unmounted render.
afterEach(() => {
  cleanup();
});
