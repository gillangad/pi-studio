import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: path.resolve(__dirname, "src/shell/main/index.ts"),
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: path.resolve(__dirname, "src/shell/preload/index.ts"),
        output: {
          format: "cjs",
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
    root: path.resolve(__dirname, "src/shell/renderer"),
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, "out/renderer"),
      rollupOptions: {
        input: path.resolve(__dirname, "src/shell/renderer/index.html"),
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  },
});
