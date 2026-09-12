import { defineConfig, devices } from "@playwright/test";

/**
 * E2E suite for the web app, run against real dev servers (Next.js +
 * the Express API) and the real Postgres dev DB seeded by
 * `pnpm --filter @siteops/db seed`. Each spec creates its own uniquely
 * named records rather than depending on a fresh seed per run, so the
 * suite is safe to re-run against a DB that already has demo/perf data
 * in it.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @siteops/api start",
      url: "http://localhost:4000/health",
      cwd: "../..",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @siteops/web dev",
      url: "http://localhost:3000",
      cwd: "../..",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
