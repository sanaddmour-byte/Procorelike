import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    // e2e/ holds Playwright specs (run via `pnpm test:e2e`), which define
    // their own `test()` global that collides with vitest's.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
