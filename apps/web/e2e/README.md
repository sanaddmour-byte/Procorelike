# E2E suite

Playwright specs driving the real Next.js dev server against the real
Express API and Postgres dev DB — not mocked. Run:

```
pnpm --filter @siteops/db seed   # once, if not already seeded
pnpm --filter @siteops/web test:e2e
```

`playwright.config.ts` starts both dev servers automatically
(`reuseExistingServer: true`, so it also works if you already have them
running). Each spec creates its own uniquely-named records (timestamped
titles/descriptions) rather than depending on a fresh seed per run, so
the suite is safe to re-run against a DB that already has demo or
`perf-check.ts` data in it.

Not wired into `pnpm test` / turbo's `test` pipeline: these specs need
live servers and a real DB, unlike the fast, mocked unit tests turbo
runs on every change. Run this suite explicitly, e.g. before shipping a
phase or in a dedicated CI job.

Covers: login (success + invalid credentials), the full punch item
status lifecycle, the full RFI lifecycle (create → submit → respond →
answer → close), a meeting's action-item → punch-item conversion, and
the dashboard rollup's per-role section gating (owner_admin vs
client_viewer).
