import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Playwright specs live under e2e/ (as *.spec.ts, which vitest's own
    // default include pattern would otherwise also match and try to run
    // with the wrong test runner's `test`/`expect` globals) -- excluded
    // here so `npm test` (vitest) and `npm run test:e2e` (playwright) each
    // only pick up their own files.
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
});
