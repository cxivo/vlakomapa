import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        help: resolve(__dirname, "help/index.html"),
        map: resolve(__dirname, "map/index.html"),
      },
    },
  },
  assetsInclude: "**/*.sqlite",
});
