// Vitest picks up jsconfig.json path aliases automatically via vite-tsconfig-paths
// only if that plugin is installed. We instead declare the alias manually so
// tests can import via `@/...` matching the rest of the codebase.

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,mjs}"],
  },
});
