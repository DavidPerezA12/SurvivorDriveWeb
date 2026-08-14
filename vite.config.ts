import { defineConfig } from 'vitest/config';

// Static bundle, no framework plugin needed. Vitest config lives here so the
// headless sim tests share the same pipeline (see docs/ARCHITECTURE.md).
export default defineConfig({
  build: {
    target: 'es2022',
    // Production deploys publish `dist/` verbatim. Hidden maps are still files
    // in that directory, so keep them out of the public build altogether.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Three.js dwarfs the game code and rarely changes; keeping it in its
        // own chunk lets deploys invalidate only the game bundle.
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    // The simulation is pure TypeScript; its tests never touch the DOM.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
