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
    //target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
    //target: "esnext",
  },
  esbuild: {
    supported: {
      "top-level-await": true, //browsers can handle top-level-await features
    },
  },
  assetsInclude: "**/*.sqlite",
});
