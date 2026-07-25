import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        game: resolve(__dirname, "index.html"),
        pressKit: resolve(__dirname, "press-kit/index.html"),
        freeBrowserRunner: resolve(__dirname, "free-browser-runner/index.html"),
      },
    },
  },
});
