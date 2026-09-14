import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [react(), wasm()],
  server: {
    proxy: {
      "/__thirdmark_issuer": {
        target: "http://127.0.0.1:8787",
        rewrite: (path) => path.replace(/^\/__thirdmark_issuer/u, ""),
      },
      "/__thirdmark_registry": {
        target: "http://127.0.0.1:8788",
        rewrite: (path) => path.replace(/^\/__thirdmark_registry/u, ""),
      },
    },
  },
  build: {
    target: "es2022",
  },
});
