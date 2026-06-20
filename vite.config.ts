import { defineConfig } from 'vitest/config';

// Static bundle, no framework plugin needed. Vitest config lives here so the
// headless sim tests share the same pipeline (see docs/ARCHITECTURE.md).
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // The simulation is pure TypeScript; its tests never touch the DOM.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
