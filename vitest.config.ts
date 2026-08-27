import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Map logic (layout math, hit detection, particle math) is pure and runs in node.
    // Component tests opt in per file with: // @vitest-environment jsdom
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["node_modules", ".next", "dist"],
  },
});
