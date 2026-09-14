import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    hookTimeout: 30000,
    testTimeout: 30000,
    setupFiles: ["./vitest.setup.ts"],
    // These are integration tests against one real, shared Postgres database and a fixed set of
    // seeded projects (not per-test isolated fixtures) -- running test files in parallel workers
    // lets two files that both mutate the same project's singleton `schedules` row (e.g.
    // cpm-schedule.test.ts and cpm-schedule-edit.test.ts, both driven through omar.nassar's one
    // accessible project) race each other. Sequential file execution trades some wall-clock time
    // for determinism, which matters more for a suite that talks to real state.
    fileParallelism: false,
  },
});
