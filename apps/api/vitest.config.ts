import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    hookTimeout: 30000,
    testTimeout: 30000,
    setupFiles: ["./vitest.setup.ts"],
  },
});
