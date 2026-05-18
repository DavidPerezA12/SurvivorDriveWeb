import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/three/")) return undefined;
          if (id.includes("/examples/jsm/loaders/")) return "three-loaders";
          if (id.includes("/examples/jsm/")) return "three-addons";
          return "three";
        },
      },
    },
  },
});
