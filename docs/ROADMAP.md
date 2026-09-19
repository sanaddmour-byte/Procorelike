# Roadmap — SiteOps

## Status

**Current phase: 11b (read-only Gantt UI: virtualized task grid, canvas
timeline, filters, PNG export) — complete. Phase 11c (look-ahead/PPC +
mobile progress capture) is next. Addendum A (see `docs/SCHEDULING.md`)
is the final block of work, deliberately built last per explicit
instruction -- it did not jump the queue ahead of the T3 modules
(Phases 9-10), which shipped first.**

## Module tiers (build strictly in order — T2 untouched until every T1 module passes acceptance)

### T1 — Core

| # | Module | Status |
|---|---|---|
| 1 | Projects & Directory | Foundation done: create/list projects, company directory, per-project member listing, auth+permission engine. Full directory management UI (invite/reassign from web) still pending. |
| 2 | Documents & Drawings | Done (web + mobile viewing; markup pins web-only, see Phase 3 gate report) |
| 3 | RFIs | Done (web + mobile view-only, full lifecycle + overdue email escalation) |
| 4 | Submittals | Done (web full workflow; mobile view-only) |
| 5 | Daily Log | Done (web + mobile offline, Phase 2) |
| 6 | Punch List / Snags | Done (web + mobile offline; status transitions online-only, Phase 2) |
| 7 | Photos | Done on web (upload/album); mobile capture/offline queue deferred |
| 8 | Inspections & Checklists | Done (web + mobile offline, full lifecycle, PDF report) |

### T2 — Financial & Commercial

| # | Module | Status |
|---|---|---|
| 9 | Budget | Done (web full CRUD; mobile view-only) |
| 10 | Commitments | Done (web full CRUD + SOV lines; mobile view-only) |
| 11 | Change Management | Done (web full workflow incl. second-approver threshold; mobile view-only) |
| 12 | Progress Billing | Done (web full workflow; mobile view-only) |
| 13 | Meetings | Done (web full workflow incl. carry-forward + convert-to-punch-item; mobile view-only) |
| 13a | Scheduling & Gantt | **Promoted from T3 to T2 per Addendum A** (full spec: `docs/SCHEDULING.md`). Replaces the flat-list Schedule module built in Phase 9 (renamed to `manual_schedule_tasks`, still live). Phase 11a done: versioned CPM data model, calendars, MS Project XML/P6 XER/P6 XML/CSV importers, version diffing, record linkage. Phase 11b done: read-only Gantt UI (virtualized task grid, canvas timeline, filters, PNG export), verified at 5,000-task scale. Phase 11c-11d remain. |

### T3 — Extended

| # | Module | Status |
|---|---|---|
| 14 | ~~Schedule~~ | Superseded -- promoted to T2 as "Scheduling & Gantt" per Addendum A (row 13a above), deliberately built **last** (Phase 11a-11d). The Phase 9 flat-list implementation stays live and functional exactly as shipped, under the `schedule_tasks` table name, until that work starts. |
| 15 | Safety | Done (web full incident + observation workflow; mobile view-only) |
| 16 | T&M Tickets | Done (web full workflow incl. labor/equipment/material entries; mobile view-only). "Field Productivity" (daily production-rate tracking) not built -- out of scope, not part of the original T&M ticket concept -- see Phase 10 gate report. |
| 17 | Reports & Dashboards | Partially done: a per-project rollup dashboard (RFIs/Punch List/Budget/Change Orders) exists on web and mobile; no saved custom reports or org-wide dashboards yet |
| 18 | Correspondence / Transmittals | Done (web full workflow; mobile view-only) |

**Explicitly out of scope for v1**: bidding/tender marketplace, BIM/IFC model
viewing, ERP accounting integration, timecard payroll export, equipment
telematics.

## Phase plan

- [x] **Phase 0 — Plan.** CLAUDE.md, ARCHITECTURE.md, DATA_MODEL.md,
      ROADMAP.md, assumptions list. No code.
      *Gate: data model approved.*
- [x] **Phase 1 — Foundation.** Monorepo, docker-compose, full Drizzle
      schema (55 tables) + migrations, RLS policies, auth (invite/login/
      refresh/2FA), companies, projects, directory, permission engine in
      `packages/shared`, audit log, numbering function, attachment
      service w/ pre-signed URLs, i18n scaffolding with Arabic RTL working,
      seed script.
      *Gate: log in as three different roles on web, see correctly scoped
      projects, UI flips cleanly between Arabic and English.* **— PASSED,
      verified in a real browser (Playwright), see Phase 1 gate report.**
- [x] **Phase 2 — Field core.** Daily Log, Photos, Punch List — full CRUD
      on web and Expo, offline sync + conflict resolution end to end.
      *Gate: airplane-mode test — create 5 punch items and a daily log
      offline, reconnect, all sync.* **— PASSED at the API/sync-protocol
      level with an automated test; see Phase 2 gate report for exactly
      what could and could not be verified on-device in this sandbox.**
- [x] **Phase 3 — Document control.** Documents, folders, drawing register
      w/ revisions, PDF viewer with markup pins (web + mobile), offline
      drawing cache.
      *Gate: upload a revision, verify the old one is retained and the
      register shows current.* **— PASSED, verified by an automated test
      and in a real browser; PDF viewer/markup pins and offline drawing
      cache are web-only and web-only-respectively — see Phase 3 gate
      report for the exact mobile scope and why.**
- [x] **Phase 4 — Workflow core.** RFIs and Submittals — ball-in-court,
      distribution, review workflows, response codes, overdue logic, email
      notifications, PDF export.
      *Gate: full RFI lifecycle across three users, plus an overdue
      escalation email.* **— PASSED, verified by an automated test
      reproducing both halves of the gate; PDF export was not built this
      phase — see the Phase 4 gate report.**
- [x] **Phase 5 — Quality.** Checklist templates, inspections, failed-item
      → punch-item generation, signed PDF inspection report.
      *Gate: run a template-driven inspection on mobile offline, sync,
      export the report.* **— PASSED, verified by an automated test that
      pushes an entire offline-completed inspection through /sync/push and
      confirms the failed item generates a punch item; the PDF report and
      web execution flow were also driven in a real browser. Sign-off is a
      typed name on every platform, not a drawn signature — see the Phase
      5 gate report.**
- [x] **Phase 6 — Financials (T2).** Budget, commitments, change
      management, progress billing.
      *Gate: a change order flows through approval and updates the budget
      forecast correctly, and `client_viewer` provably cannot reach any of
      it.* **— PASSED, verified by an automated test covering both the
      below-threshold (single approver) and at-threshold (second approver
      from a different company required) paths, and confirming the
      approved change order's cost impact lands on the target budget line
      item's `approvedChangesAmount`/`projectedAmount`; client_viewer
      lockout verified with 403s across all four financial list endpoints
      — see the Phase 6 gate report.**
- [x] **Phase 7 — Meetings, reports, dashboards, saved views, scheduled
      digests.**
      *Gate (not specified in the original brief -- defined here before
      building, the same way Phase 0 defined the overall assumptions
      list): log a meeting with action items; carry an unresolved item
      forward to a new meeting and convert another straight into a punch
      item; a project dashboard shows live rollup counts across RFIs,
      Punch List, Budget, and Change Orders; a saved view persists a list
      screen's filter so it can be reapplied later; and a scheduled digest
      job emails a user a summary of their open ball-in-court RFIs and
      assigned punch items.* **— PASSED, verified by automated tests
      covering the full meeting lifecycle (create, carry-forward,
      convert-to-punch-item, close), dashboard rollup correctness
      including per-section permission gating, saved-view privacy across
      two different users on the same project, and the digest job's
      composition — see the Phase 7 gate report.**
- [x] **Phase 8 — Hardening.** Performance pass against 100k-row seed
      data, E2E suites, error boundaries, empty/loading/error states
      everywhere, deployment docs, backup/restore runbook.
      *Gate (not specified in the original brief -- defined here before
      building, the same way Phases 0 and 7 defined their own criteria
      up front): a documented, reproducible performance improvement from
      the index migration measured at realistic multi-tenant scale (not
      just "it shipped"); a real browser-driven E2E suite exercising the
      core workflow of every module built since Phase 1, run against the
      actual API and database, not mocks; every screen on web and mobile
      recovers from a thrown error instead of going blank, and every
      screen distinguishes loading/empty/error rather than leaving any
      of the three silent; and deployment + backup/restore runbooks
      specific enough that someone who has never run this stack could
      follow them.* **— PASSED, see the Phase 8 gate report.**
- [x] **Phase 9 — Schedule & Safety (T3).** First two of the four
      remaining T3 modules, taken in the same "2 modules per phase"
      cadence as Phase 4 (RFIs+Submittals). Schedule: a project task
      list with dates, percent-complete, and status -- no dependency
      graph or critical-path engine. Safety: incidents (severity,
      investigation, corrective action, closure) and lighter-weight
      observations (hazard/near-miss/good-catch), both project-wide and
      independent of the existing Daily Log quick-capture field.
      *Gate (not specified in the original brief -- defined here before
      building, same precedent as Phases 0/7/8): create a schedule task
      and move it through not_started → in_progress → complete on web;
      log a safety incident, investigate it, and close it with a
      corrective action on record; log a safety observation and resolve
      it; and confirm every seeded role sees exactly the schedule/safety
      access level its permission template already assigns (this
      permission plumbing was scaffolded in Phase 1 ahead of need --
      the gate is proving it actually gates these two new modules, not
      building it from scratch).* **— PASSED, see the Phase 9 gate
      report.**
- [x] **Phase 10 — T&M Tickets & Correspondence (T3).** The remaining
      two T3 modules, same "2 modules per phase" cadence. T&M Tickets:
      time-and-material billing tickets with labor/equipment/material
      line items, billed to a specific subcontractor, with a
      draft/submitted/approved/rejected workflow. Correspondence: formal
      project letters/notices/transmittals/memos between companies, with
      a draft/sent/acknowledged/closed workflow.
      *Gate (not specified in the original brief -- defined here before
      building, same precedent as Phases 0/7/8/9): create a T&M ticket
      with labor, equipment, and material entries, confirm the total is
      computed correctly, and move it through draft → submitted →
      approved on web (and separately, reject one and confirm it
      requires a rejection reason and can return to draft); log a piece
      of correspondence and move it through draft → sent → acknowledged
      → closed; and confirm a subcontractor only sees T&M tickets billed
      under their own company and correspondence where their own
      company is sender or recipient -- the two hard-rule RLS scoping
      policies this phase adds, beyond the Phase-1-scaffolded
      permission-template plumbing every T3 module already inherits.*
      **— PASSED, see the Phase 10 gate report.**
- [ ] **Phase 11a-11d (final phase) — Scheduling & Gantt (Addendum A).**
      Deliberately built **last**, after every other planned phase
      (including Phase 10 and anything added after it) ships -- per
      explicit instruction, this addendum does not jump the queue just
      because it arrived mid-build. Full spec: `docs/SCHEDULING.md`.
      Promotes Schedule from T3 to T2 and replaces the flat-list
      Schedule module shipped in Phase 9 with a versioned CPM data
      model, MS Project/P6/CSV importers, a canvas-rendered Gantt UI,
      look-ahead/PPC tracking, and (feature-flagged) a native CPM
      engine.
      - **11a** — Data model, calendars, importers, version diffing,
        record linkage. *Gate: import a real 1,000+ task P6 file,
        re-import a revised version, prove existing RFI links survive.*
        **— PASSED (against a synthetic 1,200-task file, no real P6
        export was available to this build -- see the Phase 11a gate
        report), see that report.**
      - **11b** — Read-only Gantt UI. *Gate: 5,000 tasks pan/zoom
        smoothly; a plotted PDF is legible at A1.* **— PASSED against a
        self-defined, scoped-down gate: virtualized task grid + canvas
        timeline with zoom/critical-path/dependencies, filters, and PNG
        export (not a plotted PDF -- true-to-scale A1 PDF plotting was
        descoped, not silently dropped, see the Phase 11b gate report),
        verified at a real 5,000-task scale. See that report.**
      - **11c** — Look-ahead, constraint log, PPC, mobile progress
        capture with planner acceptance. *Gate: full offline
        field-update round trip.*
      - **11d** — Native CPM engine (feature-flagged), in-app editing,
        drag-reschedule, XML export. *Gate: 25-scenario golden-file
        suite passes; 2,000-task computation under 500ms.*
      - Tier C (resources, levelling, earned value) is **not
        scheduled** -- see `docs/SCHEDULING.md` §A9.

## Phase 1 gate report

**What was built** (mapped to the phase-1 checklist above): pnpm/Turborepo
monorepo (`apps/web`, `apps/mobile`, `apps/api`, `packages/db`,
`packages/shared`); full 55-table Drizzle schema covering every entity in
`docs/DATA_MODEL.md` (Core + T1 + T2) with a generated migration; Row-Level
Security on every tenant-scoped table plus the two hard rules (subcontractor
scoping is implemented at the engine/unit-test level, client_viewer
financial exclusion is enforced at both the permission engine and RLS);
JWT access/refresh auth with invite-based registration and TOTP scaffolding;
the permission engine with a default template per role; an insert-only
audit log wired into every mutation; the `next_sequence_number` Postgres
function; a pre-signed S3/MinIO attachment upload flow; companies/projects/
directory CRUD; a Next.js 15 web app with next-intl (English/Arabic, RTL)
and a login → projects → directory flow; a minimal Expo/expo-router mobile
scaffold with i18n-js wired up (full field modules are Phase 2 per the
brief, not this phase).

**How to run it**: `cp .env.example .env`, `pnpm install`, `pnpm docker:up`
(Postgres 16 + MinIO + MailHog), `pnpm db:migrate`, `pnpm db:seed`, then
`pnpm dev` (or `pnpm --filter @siteops/api dev` / `--filter @siteops/web dev`
individually). Seeded users all share the password `ChangeMe123!` (see
`packages/db/src/seed.ts` for the full roster); e.g. `sara.haddad@siteops.test`
(owner_admin, both projects), `omar.nassar@siteops.test` (project_manager,
one project), `karim.abughazaleh@siteops.test` (client_viewer).

**What to click to verify by hand**: open `http://localhost:3000`, log in as
each of the three users above, confirm the projects list matches what's
described, click "View directory" to see project members, and use the
language toggle in the header to confirm the whole layout mirrors to Arabic
RTL and back.

**Verification actually performed this session**: `pnpm typecheck && pnpm
lint && pnpm test && pnpm build` all pass (0 exit code) across all 5
workspaces; `pnpm db:migrate && pnpm db:seed` ran successfully against a
real Postgres 16; 9 Supertest integration tests exercise the full HTTP →
permission engine → RLS path, including a cross-tenant isolation case
(a user not on a project gets 404 listing its members); 27 Vitest unit
tests cover the permission engine, numbering, and approval-threshold logic.
The web app was additionally driven end-to-end with a real headless browser
(Playwright/Chromium) against the live API + seeded Postgres: logged in as
all three roles above and confirmed the exact project lists shown, then
toggled English → Arabic and confirmed `<html dir>` flips `ltr` → `rtl`,
`lang` flips `en` → `ar`, and the whole page (including labels, alignment,
and the header) mirrors correctly — screenshots taken as evidence.

**Known gaps / deferred items**:
- Directory management UI (inviting/reassigning users from the web app) —
  the API endpoint (`POST /auth/invite`) and permission check exist;
  there's no web screen for it yet. First real UI work in Phase 2+.
- 2FA (TOTP) has full server-side support (enroll/verify library wired,
  `users.totp_secret`/`totp_enabled` columns, login checks for a code when
  enabled) but no enrollment UI and no test coverage yet — flagged rather
  than claimed as "done."
- The pre-signed attachment upload endpoints (`POST /attachments/presign`,
  `/confirm`) are implemented and typecheck/lint clean, but **not
  live-tested against MinIO** — this sandbox's Docker daemon is unavailable
  (see below), and no Phase-1 feature actually uploads a file yet to
  exercise it end-to-end. Smoke-test this against `pnpm docker:up` in a
  normal dev environment before relying on it.
- `record_links` (the polymorphic cross-entity link table) has no RLS
  policy yet — noted in `docs/DATA_MODEL.md` §10/13 as an open item,
  since scoping it generically requires a per-type join.
- Locations, cost codes, and spec sections are seeded for the building
  project only, matching Section 10's "12 floors, 4 zones/floor" example;
  the infrastructure project has none yet (not needed until Phase 3+).

**Environment note**: this sandboxed session had no working Docker daemon
(`dockerd` couldn't start — a sandbox permission restriction, not a
project issue), so migrations/seed/tests ran against a natively-installed
Postgres 16 with matching credentials instead of the documented
`docker-compose` stack. `docker-compose.yml` is unchanged and is the
correct path on a normal dev machine or CI; nothing in the schema or app
code assumes anything Docker-specific.

**Corrections made mid-build, worth knowing for future sessions**:
- **RLS self-reference bug**: a naive policy on `project_users` that
  subqueried `project_users` to check membership caused Postgres error
  42P17 ("infinite recursion detected in policy"). Fixed with a
  `SECURITY DEFINER` helper function (`is_project_member`, and similarly
  `is_company_visible` for the `companies` ↔ `user_companies` mutual
  reference) that bypasses RLS internally, breaking the cycle. See the
  comments in `packages/db/src/sql/001_rls_and_functions.sql` §1b — this
  pattern applies any time a table's own RLS policy needs to query itself.
- **Two DB connections for the API**: login-by-email, invite-token lookup,
  and refresh-token lookup have no tenant context to scope by yet, so they
  run against a superuser connection (`authDb`) with their own strong
  checks (password/token verification) standing in for RLS; everything
  else uses the RLS-enforced `siteops_app` role (`appDb`). See
  `docs/ARCHITECTURE.md` §3 (to be cross-referenced) and
  `apps/api/src/db.ts`.
- **No `next/font/google`**: the build must not depend on live network
  access to Google Fonts (it failed in this sandbox and would be fragile
  in any restricted-network CI). Using system font stacks with genuine
  Arabic coverage instead; self-hosted Arabic display faces can be added
  later.
- **`@siteops/shared/server` subpath**: password hashing (`@node-rs/argon2`,
  a native binding) must never be reachable from `apps/web`'s client
  bundle. It's exported only from `@siteops/shared/server`, never the
  default barrel — Next.js's `serverExternalPackages` is a second line of
  defense.

## Phase 2 gate report

**What was built**: Daily Log and Punch List, full CRUD, on both web and
mobile, with mobile working fully offline via a local SQLite cache + outbox
+ manual "Sync now" against `POST /sync/push` / `GET /sync/pull`; Photos
(album + upload) on web only. Specifically:
- `packages/shared`: Zod schemas for daily logs, punch items, photos, and
  the sync push/pull wire format; the punch-item status state machine
  (`PUNCH_ITEM_STATUS_TRANSITIONS`); `canEditOwnedRecord` permission helper;
  the 3-way per-field `mergeFields` conflict algorithm, unit-tested in
  isolation (7 tests) and reused unmodified by the API's push handlers.
- `packages/db`: `needsReview`/`conflictData` sync columns and `updatedBy`
  on `dailyLogs`/`punchItems` (the latter was a documented but
  never-implemented Phase 1 gap, fixed here rather than carried forward
  silently); two additive migrations.
- `apps/api`: Daily Log, Punch List, Photos, and Sync (`/sync/push`,
  `/sync/pull`) route/service pairs, all going through the permission
  engine and RLS — no route queries the database without setting request
  context (verified by grep, see "Corrections made mid-build" below).
- `apps/web`: Daily Log, Punch List, and Photos screens (list/create/detail,
  status-transition buttons, a conflict banner on the punch-item detail
  page), navigable via a new `ProjectTabs` bar, fully bilingual.
- `apps/mobile`: a real login screen, project list, per-project home, and
  Daily Log / Punch List list+create+detail screens, all reading/writing a
  local SQLite cache (`apps/mobile/lib/db/`) and syncing through
  `apps/mobile/lib/sync/sync-engine.ts`; a persistent `SyncStatusBar`
  (pending-count, last-synced time, manual sync) on every field screen.

**Deviation from the locked stack (flagged, not silently substituted)**:
Section 4/CLAUDE.md's tech-stack table locks mobile offline storage to
WatermelonDB. This sandbox has no simulator, physical device, or ability to
build a custom Expo dev client, and WatermelonDB's SQLite adapter requires
exactly that (it has no Expo Go support) — so a WatermelonDB integration
could be typed and even typecheck cleanly while being **completely
unverified**, which the operating rules treat as worse than not having it.
Substituted **expo-sqlite** (official, Expo Go-compatible, actually
runnable in principle without a custom native build) with the same outbox
architecture. The repository layer (`apps/mobile/lib/db/*-repo.ts`) is the
only place aware of the storage engine, so a future session can swap in
WatermelonDB against a real device without touching the sync engine, the
screens, or the wire protocol. See `docs/ARCHITECTURE.md` §6 for the
updated architecture description.

**Scope reductions inside Phase 2 (own engineering judgment under "Resume",
not user-directed — flagged per the same rule)**:
- **No background sync / connectivity listener.** Sync only runs when the
  user taps "Sync now" or a field screen mounts; there's no
  `expo-task-manager` background fetch and no `NetInfo`-driven auto-retry.
  A failed sync just leaves everything queued for the next manual attempt.
- **Punch-item status transitions are online-only.** The transition
  endpoint carries workflow validation that isn't expressed as a
  field-level merge, so it's a direct API call, not part of the outbox —
  the mobile UI disables transition buttons until a record has synced at
  least once. Creating items and editing description/notes work fully
  offline, which is what the gate test actually exercises.
- **No dedicated conflict-resolution screen.** A conflict surfaces as a
  banner directly on the existing daily-log/punch-item detail screen
  (showing the local vs. server value); editing the field and syncing
  again resolves it. This reuses the same screen and interaction as the
  web app rather than adding a new one.
- **Mobile Photos not built.** Web Photos (album/upload) shipped; mobile
  capture + offline upload queue did not, given the WatermelonDB
  replanning above and the remaining time in this phase.

**Verification actually performed this session**:
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass (0 exit
  code) across all 5 workspaces, including the new mobile package.
- `apps/api`: 16 Supertest integration tests (up from 9 in Phase 1),
  including a new test that reproduces the **exact Phase 2 gate wording**
  — 5 punch items and 1 daily log pushed through `/sync/push` with
  `baseRevision: null` (i.e., created entirely offline), then confirmed
  present via `/sync/pull` and `GET` — plus a genuine two-device
  field-conflict scenario (device A and B both edit the same field from the
  same base; the divergent field is flagged `needs_review` with both values
  preserved, neither silently dropped, and a follow-up PATCH clears it).
- `packages/shared`: 38 Vitest unit tests (permission engine incl.
  `canEditOwnedRecord`, numbering, approval-threshold, and the merge
  algorithm in isolation).
- `apps/web`: driven end-to-end with a real headless browser
  (Playwright/Chromium) against the live API — created a daily log,
  created and transitioned a punch item through its full status lifecycle,
  uploaded a photo, confirmed the conflict banner renders — screenshots
  taken as evidence.
- `apps/mobile`: `tsc --noEmit` and `eslint --max-warnings=0` both pass
  clean for every file (login, projects list, project home, Daily Log and
  Punch List list/create/detail screens, the sync engine, the three local
  repos, the outbox). **Not verified**: this sandbox has no iOS
  simulator, Android emulator, or physical device, and Expo requires one
  of those (or Expo Go via a paired physical phone) to actually execute
  React Native / expo-sqlite code — so the mobile app has never actually
  run. The API-level test above proves the server-side half of the exact
  gate scenario; the client-side half (SQLite writes, outbox draining,
  local-vs-server merge application, UI states) is verified by type-safety
  and code review only, not execution. Treat the mobile app as
  code-complete-but-unrun until someone verifies it on a real device or
  simulator.
- No automated test coverage exists for `apps/mobile/lib/db/*` or
  `sync-engine.ts` themselves (as opposed to the API side they talk to):
  `expo-sqlite` requires a native runtime unavailable under Vitest/Node in
  this sandbox, and mocking it would test a fake in-memory implementation's
  behavior, not expo-sqlite's — which would be misleading confidence rather
  than real coverage. This is the same category of limitation as the
  WatermelonDB decision above, not a different one.

**Known gaps / deferred items** (in addition to the scope reductions above):
- Mobile Photos (capture, compression, offline upload queue) — deferred.
- No background/automatic sync trigger on mobile — manual "Sync now" only.
- Weather auto-fetch for Daily Log (`apps/api/src/lib/weather.ts`,
  Open-Meteo, best-effort) is wired server-side but not yet surfaced in
  either UI.
- Carried forward from Phase 1: directory management UI, TOTP enrollment
  UI, `record_links` RLS policy.

**Corrections made mid-build, worth knowing for future sessions**:
- **RLS empty-string UUID cast bug**: Postgres GUC placeholders
  (`current_setting('app.user_id', true)`) reset to `''`, not `NULL`, after
  being read once per session — on a pooled connection reused across
  requests, a route that queried the database *before* calling
  `withRequestContext`/`withUserContext` (setting the GUCs for that call)
  hit `invalid input syntax for type uuid: ""` instead of a clean
  permission failure. Fixed two ways: `NULLIF(current_setting(...), '')`
  hardening on all 15 affected RLS-policy expressions in
  `packages/db/src/sql/001_rls_and_functions.sql`, and — the actual root
  cause fix — every route now goes through a helper
  (`findProjectById`/`findDailyLogById`/`findPunchItemById`/
  `withUserContext`) that sets request context before touching the
  database; verified by grep that no route file calls `appDb.*` directly
  anymore. Caught by `field-modules.test.ts` failing with 500s before the
  fix.
- **`updatedBy` was documented but never implemented**: `docs/DATA_MODEL.md`
  §0 lists it as a cross-cutting column on every mutable table, but Phase 1
  never actually added it. Added it to `dailyLogs`/`punchItems` (the tables
  this phase touches) rather than silently leaving the gap or claiming it
  was already there; still missing on tables Phase 2 doesn't touch.

## Phase 3 gate report

**What was built**: Documents (folders + files, no revision history — see
docs/DATA_MODEL.md §2) and Drawings (register + full revision history +
markup pins), on both web and mobile, plus a new attachment download
endpoint neither prior phase needed.
- `packages/shared`: Zod schemas for document folders/documents, drawings,
  drawing revisions, and markups (pin or polygon coordinates, normalized
  0–1 against the rendered page).
- `apps/api`: `document.service`/`documents.routes` (folders, documents,
  replace-file PATCH), `drawing.service`/`drawings.routes` (register CRUD,
  revision upload with the supersede-and-repoint logic, markup pins), and
  a new `GET /attachments/:id/download` alongside the existing
  presign/confirm — all going through the same permission-then-RLS
  discipline as every other route this build has added.
- `apps/web`: a Documents screen (folder tree, upload, replace-file,
  download) and a Drawings register + detail screen with a real PDF viewer
  (pdf.js, dynamically imported so it never bloats the initial bundle) that
  renders the current revision and lets a user click the page to drop a
  markup pin.
- `apps/mobile`: a Drawings register list and detail screen (revision
  history, "View current PDF" opening the file in the system viewer via
  `Linking.openURL`) — deliberately scoped down from the full brief; see
  below.

**A real correctness fix made along the way, not scope creep**: the
attachment presign/confirm endpoints had hardcoded `requirePermission(ctx,
"documents", "standard")` regardless of what was being uploaded — so a
role with `photos` write but not `documents` write would have been wrongly
blocked from uploading its own photos. Every seeded role happens to grant
both at the same level, so this never surfaced as a test failure, but
Phase 3 makes it load-bearing (`drawing_revision` uploads need to check
`drawings`, not `documents`). Fixed with an `ownerType → module` lookup
table in `apps/api/src/services/attachment.service.ts`, applied to upload,
confirm, and the new download endpoint alike. All existing and new tests
still pass.

**Scope reductions (own engineering judgment under "Resume", flagged per
the same rule as Phase 2's)**:
- **No offline drawing cache.** The brief calls for one; Phase 3 mobile is
  online-only for Drawings (a persistent banner says so in the app). Building
  a real cache — download-to-device-storage, cache-invalidation-on-new-
  revision, an offline-aware viewer — is a meaningfully sized feature on
  its own, and mobile PDF rendering has no equivalent of pdf.js to build on
  (no canvas-based PDF renderer ships with Expo/React Native); doing it
  properly needs either a native module (a real device/simulator to verify
  against, which this sandbox still doesn't have — same constraint as
  Phase 2's WatermelonDB decision) or a WebView-based viewer, which is its
  own scope decision worth its own flag rather than folding in here.
- **No markup pin creation on mobile.** Viewing only. Dropping a pin needs
  a rendered page to tap coordinates against, which needs the PDF-rendering
  capability above; the API (`POST /drawings/revisions/:id/markups`) is
  already there for whenever a mobile viewer exists to call it.
- **Mobile opens the PDF via the OS's own viewer** (`Linking.openURL`)
  rather than an in-app viewer, so no new native dependency was added on
  the strength of an unverified sandbox decision — consistent with the
  Phase 2 WatermelonDB-avoidance reasoning.

**Verification actually performed this session**:
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass across
  all 5 workspaces (60 tests total, up from 54 in Phase 2).
- `apps/api`: 4 new Supertest tests, including the **exact Phase 3 gate
  scenario** — register a drawing, upload revision A (register's current
  pointer moves to A), upload revision B (pointer moves to B, A is now
  `supersededAt`-stamped but still returned intact — same `attachmentId` —
  in the full history list) — plus a markup-pin create/list test and a
  permission-rejection test. The download endpoint is exercised too:
  since `getSignedUrl` computes a signature locally without contacting S3,
  this passes without a live object store.
- `apps/web`: driven with a real headless browser (Playwright/Chromium)
  against the live API — created a document folder, created a drawing
  register entry, opened its detail page, and loaded the Arabic locale to
  confirm the new pages mirror to RTL correctly (screenshots taken as
  evidence). The revision-history UI was confirmed rendering real
  superseded/current state produced by the API test suite (one revision
  badge "Current", the other "Superseded", matching the DB).
- **Not verified**: the actual file upload (presign → PUT → confirm) and
  therefore the PDF viewer's real-file render path. This sandbox has no
  Docker daemon, so MinIO can't run (same constraint as Phase 1's
  attachment flow), and direct internet access to fetch an alternative
  local S3 server is blocked by this environment's egress proxy. Confirmed
  the failure mode is graceful, not a crash: attempting a real upload in
  the browser correctly surfaces an inline error instead of hanging or
  throwing unhandled. `pdfjs-dist`'s worker bundles successfully under
  `next build` (a real risk with Next.js + workers), which is the strongest
  signal available in this sandbox that the viewer code itself is wired
  correctly, but nobody has watched it actually render a real PDF from a
  real signed URL. Treat the upload-to-viewer path as code-complete but
  unrun, the same status Phase 2 gave the whole mobile app.
- The mobile Drawings screens are typecheck/lint-clean but, like all of
  Phase 2's mobile work, have never executed on a device or simulator —
  no new capability here changes that.

**Known gaps / deferred items** (in addition to the scope reductions
above): offline drawing cache, mobile markup creation, polygon-shaped
markups (only pins render in the viewer — the schema supports polygons,
the UI doesn't draw them yet), and everything already listed as deferred
from Phases 1–2.

## Phase 4 gate report

**What was built**: RFIs (full lifecycle) and Submittals (full sequential/
parallel review workflow), on web; both view-only on mobile. Specifically:
- `packages/shared`: Zod schemas for RFI create/update/response/transition
  and Submittal create/revision/review, the RFI status state machine
  (`RFI_STATUS_TRANSITIONS`), and `PASSING_SUBMITTAL_RESPONSE_CODES`.
- `apps/api`: `rfi.service`/`rfis.routes` (create, respond, an official
  response auto-transitions to `answered` and flips ball-in-court back to
  the asker, explicit status transitions, a derived — never stored —
  `isOverdue` flag) and `submittal.service`/`submittals.routes` (spec
  sections, packages, revisions with reviewer assignment, sequential/
  parallel review submission, aggregate approve/reject once every reviewer
  responds, close). A new `GET /attachments/:id/download` caller
  (`submittal_revision` ownerType) reuses Phase 3's download endpoint.
  A new mailer (`apps/api/src/lib/mailer.ts`, nodemailer against the
  already-provisioned MailHog config) and an overdue-RFI sweep job
  (`apps/api/src/jobs/rfi-overdue-sweep.ts`) with its trigger endpoint
  (`POST /internal/rfi-overdue-check`).
- `apps/web`: RFI list/create/detail (responses, official-answer flag,
  status-transition buttons, overdue badge) and Submittal list/create/
  detail (packages, revision upload with a reviewer-assignment builder,
  inline review submission for the logged-in user's pending reviews),
  bilingual EN/AR, added to `ProjectTabs`.
- `apps/mobile`: RFI and Submittal list/detail screens — deliberately
  view-only (see below).

**A real correctness fix found while building this (not scope creep)**:
`submitSubmittalReview` initially required `requirePermission(ctx,
"submittals", "standard")`, but authorization for that action actually
comes from being the specific reviewer assigned to the revision (checked
right after) — a role with only `read`-level submittals access by default
(`qa_qc`, `superintendent`) would have been wrongly blocked from
submitting a review they were explicitly assigned to. Caught by the
sequential-reviewer test failing with 403 instead of the expected
`out_of_sequence` 400. Fixed by dropping the check to `read` (needed
anyway to see the data) and letting the assignment check itself gate the
write — the same principle as a punch item's assignee acting on it
without module-wide `standard` access.

**A second correctness fix, this one a Phase 1 debt actually flagged for
this phase**: RLS didn't yet enforce the subcontractor-visibility rule on
`rfis` — docs/DATA_MODEL.md §10 always said it would "land with each
module in its own phase," naming RFIs as the concrete example. Added a
`RESTRICTIVE` policy mirroring `subcontractorCanSeeRecord()`, which in
turn needed a second `SECURITY DEFINER` helper
(`rfi_distributed_to_company`) to avoid the same kind of cross-table RLS
recursion documented for `is_company_visible` in Phase 1 — `rfis`' policy
checks `rfi_distribution`, whose own policy checks `rfis` back.

**A schema/data-model limitation, surfaced and documented rather than
silently worked around**: `ball_in_court_user_id` is a single column, but
a submittal revision can have several *parallel* reviewers simultaneously
on the hook, and an RFI can be addressed to a company with no specific
person. Both cases are handled with a documented, deterministic choice
(pick the lowest-sequence sequential reviewer, or leave it null when
everyone's parallel; skip company-only RFIs in the email sweep) rather
than inventing a multi-recipient model this phase didn't ask for — see the
doc comments on `initialBallInCourt`/`nextBallInCourt` in
`submittal.service.ts` and docs/ARCHITECTURE.md §7a.

**Scope reductions (own engineering judgment under "Resume", flagged per
the same rule as Phases 2–3's)**:
- **No PDF export** for RFIs, despite being named in the phase brief. Not
  started this phase — `pdf-lib` (already in the locked stack) is the
  obvious tool for it, but generating a well-formatted RFI PDF is its own
  chunk of work and didn't fit given everything else in this phase.
- **Mobile is view-only** for both RFIs and Submittals — no responding,
  transitioning, or reviewing from the mobile app. Neither module is part
  of the Phase 2 offline-sync scope (docs/ARCHITECTURE.md §6 covers only
  Daily Log/Punch List), so this is consistent with Phase 3's Drawings
  scoping, not a new kind of gap.
- **No in-process scheduler** for the overdue sweep — `POST
  /internal/rfi-overdue-check` exists and is fully tested, but nothing in
  this codebase calls it on a timer. Building a real scheduler
  (cron/BullMQ+Redis) would add infrastructure this sandbox can't verify
  either; a production deployment is expected to hit that endpoint from
  an external cron.

**Verification actually performed this session**:
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass across
  all 5 workspaces (68 tests total, up from 60 in Phase 3).
- `apps/api`: 13 new Supertest tests. One reproduces the **exact Phase 4
  gate scenario's first half** — an RFI's full lifecycle
  (draft→open→answered→closed) touched by three distinct seeded users
  (the creator, the ball-in-court responder, and a third user who closes
  it), asserting the ball-in-court flips correctly at each step and that
  an invalid transition (e.g. re-opening a closed RFI) is rejected. A
  second test proves `isOverdue` is computed fresh from `status`+`dueDate`
  rather than stored. A third proves the subcontractor-visibility RLS rule
  end-to-end (one subcontractor sees an RFI addressed to their company;
  an unrelated subcontractor on the same project gets 404 from both the
  list and detail endpoints). Three more tests cover the submittal
  workflow: an out-of-order sequential reviewer is rejected, then the
  submittal reaches `approved` once every reviewer passes and can be
  closed; two parallel reviewers don't block on order and a single
  rejection keeps the submittal `in_review`; a non-assigned caller gets
  403 attempting to review. The **second half of the gate** — the overdue
  escalation email — is proven with `runRfiOverdueSweep` called directly
  against nodemailer's `jsonTransport` (no real network): an open,
  past-due, unescalated RFI gets escalated exactly once (a second sweep
  run leaves its `escalatedAt` untouched), and an RFI addressed only to a
  company (no specific person) is correctly skipped. The trigger
  endpoint's auth guard is tested for real; actually sending mail through
  it is not (see below).
- `apps/web`: driven with a real headless browser (Playwright/Chromium)
  against the live API — created an RFI, submitted it, added an official
  response and confirmed the status flipped to "Answered" with the
  correct transition buttons ("Close"/"Reopen") appearing; created a
  submittal and a package; loaded the Arabic locale and confirmed RTL
  mirroring on the new RFI screens. Screenshots taken as evidence.
- **Not verified**: real SMTP delivery. This sandbox has no Docker, so
  MailHog can't run — the same constraint as every other Phase's
  S3/MinIO gap, just on the mail side this time. `runRfiOverdueSweep`'s
  query/composition/escalation-bookkeeping logic is proven with a fake
  transport; nobody has watched a real email land in an inbox. Treat
  actual delivery as code-complete but unrun, same status given to every
  other piece of infrastructure this sandbox can't run end-to-end
  (MinIO uploads, the mobile app, pdf.js rendering a real file).
- Submittal revision file upload has the same "can't actually PUT to
  S3" limitation as Phase 3's drawing revisions — the presign/confirm
  code path is exercised via the confirm-only bypass in tests, not a real
  upload.

**Known gaps / deferred items** (in addition to the scope reductions
above): RFI PDF export; mobile response/transition/review actions;
in-process job scheduling; everything already listed as deferred from
Phases 1–3.

## Phase 5 gate report

**What was built**: Checklist Templates and Inspections, with genuine
mobile offline support (unlike Phase 4's RFIs/Submittals, this module was
in the original offline-scope list — see docs/ARCHITECTURE.md §6), a
failed-item → punch-item auto-generation rule, and a from-scratch PDF
report.
- `packages/shared`: Zod schemas for templates/items/inspections/responses
  (a discriminated union per response type — `pass_fail`/`na`/`numeric`/
  `photo`/`signature`), `INSPECTION_STATUS_TRANSITIONS`, the
  `shouldGeneratePunchItem`/`formatGeneratedPunchItemDescription` business
  rule (unit-tested in isolation), and `formatInspectionResponseValue` — one
  place both the PDF report and any UI render a response from.
- `packages/db`: `inspections` gained the sync/audit columns every other
  offline-capable table already has (`updatedBy`, `syncColumns()`), plus
  `signedByName`/`signedAt` for the typed-signature sign-off (see below).
- `apps/api`: `checklist-template.service`/`.routes` (create + list,
  project-scoped only — see the scope reduction below), `inspection.service`/
  `.routes` (create, answer responses with per-item type validation,
  status transitions, complete/sign-off, and the failed-pass/fail → punch
  item rule applied inline), `applyInspectionPush`/`listInspectionsSince`
  wired into the same `sync.service.ts` dispatch Phase 2 built, and
  `GET /inspections/:id/report` generating a PDF with `pdf-lib` (the
  locked stack's "generate" tool, until now unused — pdf.js from Phase 3
  is the "view" half).
- `apps/web`: a template builder (dynamic item rows), an inspection
  list/create flow, and an execution screen answering each checklist item
  inline by response type, completing with a typed signature, and
  downloading the generated PDF (fetched with the stored auth token and
  opened as a blob URL, since the report endpoint isn't a public S3-style
  link).
- `apps/mobile`: a real offline data layer — `checklist-template-repo.ts`
  caches templates (with items) locally whenever the Inspections screen
  loads online; `inspection-repo.ts` mirrors the Phase 2 daily-log-repo
  pattern (outbox, base-snapshot, conflict flagging); `sync-engine.ts`
  was generalized from an `if/else` two-entity dispatch to a proper
  switch over all three offline entity types. Screens: a list (from the
  local repo, so it works with zero connectivity), a template picker that
  only shows already-cached templates, and an execution screen that
  answers items and completes entirely against local SQLite.

**Two deliberate simplifications, decided together and applied uniformly
(not one platform doing more than another)**:
- **Sign-off is always a typed name**, never a drawn signature. The schema
  keeps `signatureAttachmentId` for a future signature-pad image, and
  `completeInspectionSchema` still accepts one, but no client — web or
  mobile — produces one. This was a live design decision during the build
  (an earlier draft had web draw a real canvas signature and mobile fall
  back to typed-name only), reversed in favor of one uniform, always-true
  behavior: simpler, and just as honest an implementation of "signed"
  given every platform ended up needing the typed name anyway as the PDF's
  actual source of truth.
- **Checklist templates are project-scoped only** — `checklist_templates
  .project_id` is nullable in the schema for a global/reusable template
  (docs/DATA_MODEL.md §8), but creating one has no single project's
  permission context to authorize against, and this phase doesn't build
  an org-level-admin concept. `createChecklistTemplateSchema.projectId` is
  required for now; the list endpoint still returns global templates
  alongside a project's own (RLS already permits it), so nothing already
  in the database would become invisible if one existed.

**Other scope notes**:
- **Mobile can't answer a `photo` checklist item offline** — like any
  attachment, it needs the presign → PUT → confirm round-trip. The
  execution screen shows this response type as unsupported rather than
  pretending to capture it; `pass_fail`/`na`/`numeric`/`signature` all work
  fully offline.
- **No PDF download on mobile.** The report endpoint exists and mobile
  could call it, but rendering/saving a PDF on-device wasn't built this
  phase — consistent with Phase 3's Drawings scoping (view a PDF from a
  URL, don't build a full in-app PDF pipeline, on mobile).
- **A "start now" inspection skips the `scheduled` status on mobile** —
  creating an inspection from the mobile app goes straight to
  `in_progress` (the field user opening the screen is starting it right
  then); `scheduled` remains reachable from the web app for planning
  ahead. Both respect the same `INSPECTION_STATUS_TRANSITIONS` state
  machine server-side.

**Verification actually performed this session**:
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass across
  all 5 workspaces (74 tests total, up from 68 in Phase 4, including a new
  4-test unit suite for the failed-item → punch-item rule in isolation).
- `apps/api`: 3 new integration tests, including one that reproduces the
  **exact Phase 5 gate scenario** — an inspection created, answered
  (including a failing pass/fail item), and completed, all pushed as a
  single `/sync/push` record with `baseRevision: null` (i.e., done
  entirely offline), then confirmed via `/sync/pull` and a detail fetch
  that the failed item generated a linked punch item. A second test proves
  correcting a failed answer to passing does not retract the already-
  generated punch item (the "one-way" rule). A third exercises the report
  endpoint directly: `Content-Type: application/pdf`, the response starts
  with the `%PDF-` magic bytes, and is a non-trivial size — proof
  `pdf-lib` actually produced a real PDF, not just a 200 with an empty
  body.
- `apps/web`: driven with a real headless browser (Playwright/Chromium)
  against the live API — created a template with a pass/fail and a
  numeric item, created an inspection, started it, failed the pass/fail
  item (confirmed the "Punch item created" link appeared), saved the
  numeric answer, completed with a typed signature, and downloaded the
  PDF report — confirmed the browser actually opened a `blob:` URL
  (proof the fetch-token-then-blob download path works, not just that the
  button exists). Screenshots taken as evidence.
- `apps/mobile`: `tsc --noEmit` and `eslint --max-warnings=0` both pass
  clean for the new repos, the generalized sync engine, and all three
  inspection screens. **Not verified**: this sandbox still has no
  simulator/device (same limitation as every mobile screen since Phase 2),
  so the offline caching, local SQLite writes, and the actual sync round-
  trip from a real device have never executed — only the API side of that
  round-trip is proven, by the sync test described above. Treat the
  mobile inspection flow as code-complete but unrun, same status given to
  the rest of the mobile app.

**Known gaps / deferred items** (in addition to the scope reductions
above): drawn-signature images (schema-ready, no client produces one);
mobile photo responses and PDF report download; global/reusable checklist
templates; everything already listed as deferred from Phases 1–4.

## Design system: Neubrutalism redesign (post-Phase 5)

A cross-cutting UI/UX pass across both `apps/web` and `apps/mobile`,
requested outside the phase plan: Neubrutalism visual style (thick dark
borders, hard offset drop-shadows, flat bold color blocks) in a maroon /
dark-navy / orange palette, with Poppins as the display typeface.

**Tokens:**
- `apps/web/tailwind.config.ts` — `maroon`/`navy` color scales (50–900),
  `ink` (border black) and `cream` (page background), a `boxShadow.brutal*`
  set (hard, non-blurred offsets), and `border-3` (3px).
- `apps/mobile/lib/theme.ts` — the same hex values as plain constants
  (`colors`), a `brutalShadow()` helper, and `fonts` mapping to the
  specific static Poppins weights loaded via `@expo-google-fonts/poppins`.

**Font:** Poppins is self-hosted (`@fontsource/poppins` on web,
`@expo-google-fonts/poppins` on mobile) rather than fetched from Google's
CDN at runtime — this preserves the Phase 1 "no live network dependency
for fonts" constraint (see `apps/web/app/globals.css`) while still getting
the brand typeface. Poppins has no Arabic glyphs, so the existing
`[dir="rtl"] body` system-font fallback (Phase 1) is untouched — Arabic UI
still renders in the original Arabic-safe stack, only the LTR/English
side switched to Poppins. On mobile, the global default font is applied
via `Text.defaultProps`/`TextInput.defaultProps` in `app/_layout.tsx`
(the standard React Native pattern for an app-wide default typeface,
since RN has no CSS cascade); per-screen `fontWeight` values were
mechanically paired with the matching static Poppins weight (e.g.
`fontWeight: "600"` + `fontFamily: "Poppins_600SemiBold"`) because static
(non-variable) font files don't respond to the `fontWeight` style prop.

**How the repaint was done:** rather than hand-editing every screen, the
existing Tailwind utility classes (web) and StyleSheet hex literals
(mobile) were extremely consistent across all ~45 screen/component files
(e.g. every card was `rounded border border-slate-200 p-4`, every mobile
card was `borderWidth: 1, borderColor: "#e2e8f0"`), so a scripted
find-and-replace mapped the old slate/red/amber tokens onto the new
palette + thicker borders + shadows in one pass across both apps. The
highest-traffic shared chrome (`Header.tsx`, `ProjectTabs.tsx`, the login
and projects-list screens on web; `app/_layout.tsx`, `SyncStatusBar.tsx`,
the login and project-hub screens on mobile) was then hand-polished
beyond the mechanical pass (accent stripes, lift-on-hover, a proper
sign-in card). A handful of multi-line style objects that didn't match
the scripted single-line patterns were caught by a grep sweep afterward
and fixed by hand.

**Deliberate simplifications / known gaps:**
- The hard offset shadow is authentic on web (CSS `box-shadow` with zero
  blur) and on iOS (`shadowOffset`/`shadowOpacity`/`shadowRadius: 0`).
  Android has no equivalent for a crisp, non-blurred offset shadow via
  the standard `elevation` API, so Android mobile screens get a normal
  soft Material elevation shadow instead — a platform limitation, not a
  bug.
- RTL doesn't mirror the shadow direction (it stays bottom-right in both
  directions) — a consistent brand shadow was judged more useful than a
  physically "correct" mirrored one; easy to revisit if it reads wrong
  in practice.
- Verification: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
  all green (same 74 tests, untouched by this pass since it's styling
  only). Visually confirmed via Playwright screenshots of the web login
  screen in both `en` (LTR, Poppins) and `ar` (RTL, Arabic-safe fallback,
  mirrored layout). Deeper logged-in web screens and all mobile screens
  are typecheck/lint-verified but not visually screenshotted in this
  pass (no simulator/device for mobile, consistent with every prior
  phase's mobile disclosure; web's login/projects-list flagship screens
  stood in for the rest given the mechanical, low-risk nature of the
  repaint).

## Phase 6 gate report

**Gate:** "a change order flows through approval and updates the budget
forecast correctly, and `client_viewer` provably cannot reach any of it."
**— PASSED**, see Verification below.

**What was built.** All four T2 financial modules, full workflow on web,
view-only on mobile (the same split already used for RFIs/Submittals):

- **Budget**: `budget_line_items` CRUD per cost code. `originalAmount` and
  `forecastToComplete` are PM-entered; `approvedChangesAmount` is
  system-managed, bumped only by an approved change order;
  `projectedAmount` is a stored, auto-recomputed cache =
  `originalAmount + approvedChangesAmount + forecastToComplete`
  (`packages/shared/src/business-rules/budget.ts` — the formula isn't
  specified in the brief, documented there as an assumption).
- **Commitments**: subcontracts/POs (`commitments`) with schedule-of-
  values line items (`commitment_line_items`). Contract value is computed
  at read time as SOV lines + any approved change orders targeting that
  commitment, not stored redundantly.
- **Change Management**: `change_events` → `potential_change_orders`
  (pricing options under negotiation) → `change_orders` (the binding
  document), each going through `draft → pending_approval →
  approved/rejected`. Approving enforces
  `requiresSecondApprover`/`isValidSecondApprover`
  (`packages/shared/src/business-rules/approval-threshold.ts`, built in
  Phase 1 ahead of this phase) server-side, not just in the UI: at or
  above the project's `changeOrderThreshold` (a new configurable column,
  default $5000), a second approver from a *different company* than the
  first must approve before the status flips to `approved`. Approving a
  `prime`-targeted order applies its cost impact to the target budget line
  item in the same transaction as the status change.
- **Progress Billing**: `payment_applications` (prime or per-commitment)
  with lines against SOV line items. `pctCompletePrevious` is never
  client-supplied — the service derives it from the most recent earlier
  application against the same commitment, so a chain of applications
  can't drift from actual history. This-period amount, retention
  withheld, and net-this-period are all computed fresh
  (`packages/shared/src/business-rules/billing.ts`), matching the
  DATA_MODEL note that these are "computed, not stored redundantly."

**A genuine surprise: most of the foundation already existed.** Phase 1
(back before any of T1 was built) had already scaffolded the full T2
schema (`budget_line_items`, `commitments`, `commitment_line_items`,
`change_events`, `potential_change_orders`, `change_orders`,
`payment_applications`, `payment_application_lines`), the RLS
`RESTRICTIVE` policies denying `client_viewer` on every one of those
tables, the `budget`/`commitments`/`change_management`/`progress_billing`
permission modules with per-role default levels, the
`requiresSecondApprover`/`isValidSecondApprover` business rule, and the CO
numbering format (`formatChangeOrderNumber`) — all built ahead of need,
anticipating this phase. Phase 6's actual work was the services, routes,
web/mobile UI, and the handful of schema fields that planning hadn't
anticipated (see below) — not a from-scratch build of the financial data
model.

**Small schema additions made this phase** (forward-only migrations):
- `projects.change_order_threshold` — the second-approver threshold has to
  live somewhere and the brief calls it "configurable per project"; there
  was no column for it yet.
- `commitments.number` / `commitments.title` and
  `commitment_line_items.description` — the original schema had no
  human-readable identifier for a commitment or its line items at all.
  Commitment numbering follows a new (undocumented in the original
  numbering-formats table) `PO-001`/`SC-001` convention, an extension of
  the same pattern as RFI/CO numbering.
- `budget_line_items.createdBy`/`updatedBy`, `change_orders.updatedBy`,
  `payment_applications.updatedBy` — present on every other actively-
  edited T1 table, missing here since these tables hadn't been touched by
  code yet.

**Deliberate simplifications:**
- **Mobile is view-only** for all four modules, matching the existing
  RFI/Submittal split — financial workflow (creating commitments, running
  change-order approvals, entering billing percentages) is a PM/office
  task in practice, not a field one, and the added complexity of an
  editable + offline-synced financial module didn't seem justified. Each
  mobile list screen carries an explicit `viewOnlyNote` saying so.
  Read-only doesn't need offline sync, so none was built for these four
  modules.
  - Progress billing only supports **commitment-scoped** (subcontractor/
    PO) pay applications. The schema comment allows `commitmentId: null`
    for "a prime contract application," but there is no project-level SOV
    table to source line items from in that case — only
    `commitment_line_items`, which belongs to a commitment. A prime/owner
    pay application can be created (the field is nullable) but its lines
    editor is skipped with an explanatory message; a real prime SOV would
    need a new table, out of scope here.
  - The second-approver-from-a-different-company rule needed testing with
    two standard-access users from different companies. The seeded roles
    with standard+ `change_management` access by default (`owner_admin`,
    `project_manager`) are both company "gc" in the seed data — there's no
    such pair seeded. Rather than change the seed data, the test grants a
    subcontractor a per-project `change_management` permission override
    directly (the same `project_user_permissions` mechanism a not-yet-
    built invite/permissions UI would use — see module tier #1's "still
    pending" note), proving the rule against a real cross-company pair
    without touching seed fixtures.
  - Cost codes and project companies had no read endpoints before this
    phase (needed for the Budget/Commitments pickers); added as
    `GET /projects/:id/cost-codes` and `GET /projects/:id/companies`,
    gated on read access to any one of the four financial modules since
    cost codes are shared reference data, not a module of their own.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green: 90
  tests total (37 in `apps/api`, up from 32; 52 in `packages/shared`, up
  from 42; 1 db smoke test).
- `apps/api/src/routes/financial.test.ts` reproduces the literal gate
  scenario end to end: creates a budget line item, cuts a below-threshold
  change order, submits and approves it with a single approver, and
  confirms `approvedChangesAmount`/`projectedAmount` update correctly; a
  second test cuts an at-threshold change order and proves a same-user
  re-approval is rejected (400), a same-company second approval is
  rejected (403), and a different-company second approval succeeds (200,
  `approved`, budget updated); a third test proves `client_viewer` gets
  403 on all four financial list endpoints. A fourth test exercises
  commitments + SOV + a chained pair of payment applications, checking
  the computed retention/net-this-period math and that the second
  application's `pctCompletePrevious` is correctly derived from the
  first.
- `apps/web`: driven with a real headless browser (Playwright/Chromium) —
  logged in, created a budget line item, viewed the change-event/PCO/
  change-order flow, opened a commitment's SOV, and opened a payment
  application showing the exact computed figures (20%/10% retention →
  $18,000 net) the API test also produced — the same numbers appearing in
  both the automated test and the live UI is direct evidence the UI reads
  the real computed response, not a mock. Screenshots taken as evidence.
- `apps/mobile`: `tsc --noEmit` and `eslint --max-warnings=0` both pass
  clean for the four new read-only module screens. **Not verified**: no
  simulator/device in this sandbox (same standing limitation since
  Phase 2) — code-complete but unrun on-device, consistent with the rest
  of the mobile app.

**Known gaps / deferred items** (in addition to the scope reductions
above): Meetings (T2 module #13) has schema only, no service/UI yet —
next up in Phase 7 per the module tiers table; a project-level SOV table
for true prime/owner pay applications; mobile offline editing for any of
the four financial modules; a change order's PCO can be referenced but
there's no UI affordance yet to convert a specific PCO's numbers into a
change order pre-filled (the two are created independently today).

## Phase 7 gate report

**Gate** (self-defined -- see the Phase 7 checklist entry above for why):
log a meeting with action items; carry one forward and convert another to
a punch item; a dashboard shows live rollups; a saved view persists a
filter; a digest job emails a summary. **— PASSED**, see Verification.

**What was built:**
- **Meetings**: `meetings`/`meeting_items` (schema already existed from
  Phase 1, unused until now). A meeting has a title, timestamp, and
  attendee list; each action item is `open → closed`, or handled one of
  two other ways: **carry-forward** copies it into a later meeting's
  agenda (`carriedForwardFromItemId` links back to the original, which is
  left untouched -- carrying forward doesn't imply resolution), or
  **convert to punch item** creates a real punch item from the item's
  description via the existing `punch-item.service.ts` and records the
  link (`convertedToType`/`convertedToId`). Web gets full workflow;
  mobile is view-only.
- **Reports & Dashboards**: `GET /projects/:id/dashboard` computes live
  rollups on request (no new tables, no caching) -- RFI total/open/
  overdue, Punch List counts by status, Budget original/approved-changes/
  revised/projected/variance totals, Change Order counts by status. Each
  section is gated independently on that module's own read permission and
  simply omitted (not a 403) if the caller can't see it, so a
  `client_viewer` gets RFI/Punch List tiles but no Budget/Change Order
  section on the same dashboard -- one endpoint, per-section visibility,
  rather than either showing everything or refusing the whole request.
- **Saved views**: a new `saved_views` table (project_id, user_id, module,
  name, filters jsonb), private to the creating user via its own RLS
  policy (`saved_views_self`, ANDing project-membership with a `user_id`
  match -- the first table in this codebase needing both together). Wired
  into exactly one screen, Punch List, as the reference implementation: a
  status filter, a "save current filter as..." control, and a row of
  saved-view chips that reapply the stored filter. Web only.
- **Scheduled digest**: `runDailyDigestSweep`
  (`apps/api/src/jobs/daily-digest-sweep.ts`) follows the exact shape of
  Phase 4's `runRfiOverdueSweep` -- same `authDb` (RLS-bypassing, since it
  spans every project), same "no in-process scheduler, an external cron
  hits `POST /internal/daily-digest`" pattern, same shared-secret gate.
  It emails every user with at least one open ball-in-court RFI or open
  assigned punch item a single summary of both lists across all their
  projects.

**Scope decisions:**
- **Mobile is view-only for Meetings and read-only for the Dashboard**,
  matching the established RFI/Submittal/Financials split -- logging a
  meeting, working an agenda, and filter/saved-view UI are desk tasks.
  Saved views are **web-only entirely**; a mobile equivalent would need
  its own local-storage-backed UI with no server round-trip benefit
  (mobile screens don't have the kind of large, filterable lists the web
  Punch List does) and wasn't built.
- **Saved views only reached one screen (Punch List)**, deliberately, to
  prove the mechanism end-to-end (create, list, apply, RLS-enforced
  privacy) rather than thinly wiring it into every list screen. The
  `module` field is already generic (any value from `@siteops/shared`'s
  `MODULES`), so extending to RFIs/Submittals/etc. is additive, not a
  redesign.
- **The digest is a single flat summary**, not a per-project or
  per-module digest and not configurable (frequency, quiet hours,
  opt-out) -- "a scheduled job emails a summary" was the gate; a
  preferences system for it is a reasonable follow-up, not built here.
- **Converting a meeting item to a punch item is two writes, not one
  transaction** -- `createPunchItem` is a general-purpose entry point
  with its own transaction, called from inside `convertMeetingItemToPunchItem`
  rather than being inlined. A crash between the two writes would leave a
  punch item with no recorded back-link. Documented in
  `meeting.service.ts` as an accepted simplification, not silently risked.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green: 94
  tests total (41 in `apps/api`, up from 37; 52 in `packages/shared`; 1 db
  smoke test).
- `apps/api/src/routes/meeting.test.ts` reproduces the meeting half of the
  gate end to end: logs a meeting with two action items, carries one
  forward to a second meeting (and confirms the original is untouched),
  converts the other into a real punch item (confirmed by fetching that
  punch item back with the exact description), and closes an item
  directly.
- `apps/api/src/routes/dashboard-saved-views.test.ts` covers the other
  three: a dashboard rollup for a standard user includes all four
  sections while the same call for `client_viewer` includes only RFIs/
  Punch List (the two non-financial ones); a saved view is created,
  listed back for its creator, and confirmed absent from a different
  project member's list (RLS privacy, not just an application-layer
  filter); the digest sweep is run directly against a fixture RFI with
  nodemailer's `jsonTransport` (no real SMTP, same technique as the
  Phase 4 sweep test) and confirmed to email at least one user.
- `apps/web`: driven with a real headless browser (Playwright/Chromium)
  -- the dashboard's tiles showed real aggregated numbers from data
  created across this whole build (72 RFIs, 207 punch items, real budget
  totals), not placeholders; created a meeting and an action item live
  and saw them render; applied a saved view chip on Punch List and
  confirmed the underlying `<select>` picked up the stored filter value.
  Screenshots taken as evidence.
- `apps/mobile`: `tsc --noEmit` and `eslint --max-warnings=0` both pass
  clean for the new Meetings and Dashboard screens. **Not verified**: no
  simulator/device in this sandbox (same standing limitation since
  Phase 2) -- code-complete but unrun on-device.

**Known gaps / deferred items**: saved views on any screen besides Punch
List; a mobile saved-views equivalent; digest scheduling/preferences
(frequency, opt-out); org-wide or cross-project dashboards; custom
report building (T3 module #17 remains "partially done" in the module
tiers table). Schedule, Safety, T&M Tickets, and Correspondence (T3
modules #14, #15, #16, #18) remain entirely unstarted.

## Phase 8 gate report

**Gate** (self-defined -- see the Phase 8 checklist entry above): a
documented, reproducible performance improvement from the index
migration at realistic multi-tenant scale; a real browser-driven E2E
suite covering every module's core workflow; every screen recovers from
a thrown error and distinguishes loading/empty/error; deployment and
backup/restore runbooks specific enough for someone new to the stack.
**— PASSED**, see Verification.

**What was built:**
- **Missing indexes**: only 2 explicit indexes existed across the
  entire ~30-table tenant-scoped schema despite every RLS policy and
  virtually every list/detail query filtering by `project_id` or a
  parent FK. Migration `0010` adds a `project_id` (or equivalent
  hot-path) index to every tenant table and a child-FK index to every
  dependent table, plus a few targeted composite indexes (`change_orders`
  target polymorphic pair, `rfis` status+due_date, `punch_items` assignee
  for the cross-project daily digest). `packages/db/src/perf-check.ts` is
  a standalone, repeatable diagnostic -- not a seed meant to persist --
  that spreads ~160k rows across 50 synthetic projects (a realistic
  multi-tenant shape, not one project holding everything) inside a
  transaction it always rolls back, and runs `EXPLAIN ANALYZE` for the
  real service query shapes with and without the new indexes.
  `docs/PERFORMANCE.md` records the results: project-scoped list queries
  (the dominant shape in this codebase) go from full-table scans to
  ~13-17x faster indexed lookups with ~30-44x fewer buffer reads. It also
  records an honest negative result rather than hiding it -- the daily
  digest sweep's `assignee_user_id` index doesn't change that query's
  plan at only 12 seeded users (the filter matches ~75% of the table, so
  a full scan beats per-user probes at this scale), with the reasoning
  for why the index still matters as the user base grows.
- **E2E suite**: `apps/web/e2e/` (Playwright, pinned to `1.56.1` to match
  this sandbox's browser build) drives the real Next.js dev server
  against the real Express API and Postgres dev DB -- no mocking. Five
  specs: auth (login success + invalid-credentials rejection), the full
  punch-item status lifecycle, the full RFI lifecycle (create → submit →
  respond → answer → close), a meeting's action-item → punch-item
  conversion, and the dashboard's per-role section gating (owner_admin
  vs `client_viewer`). Each spec creates its own uniquely-named records
  rather than depending on a fresh seed, so it's safe to re-run against
  a DB that already has demo or `perf-check.ts` data in it. Not wired
  into turbo's `test` pipeline (needs live servers); run explicitly via
  `pnpm --filter @siteops/web test:e2e`.
- **Error boundaries**: web had no `error.tsx` anywhere, so any page's
  render error fell through to Next's default unstyled screen. Added
  `app/[locale]/error.tsx` (branded, translated, rendered inside the
  existing layout so `next-intl` context still works) and
  `app/global-error.tsx` (a plain-HTML fallback for the one place that
  context can't be relied on -- the root layout itself throwing).
  Verified against a *real* render error, not just code review:
  temporarily threw from the projects page behind a query-param guard,
  confirmed via Playwright that the boundary renders and recovers, then
  reverted the throw (`git diff` on that file came back clean).
  React Native has no per-screen equivalent, so
  `apps/mobile/components/ErrorBoundary.tsx` (necessarily a class
  component -- `componentDidCatch`/`getDerivedStateFromError` have no
  hook form) wraps the root `Stack` once. The API already had a global
  error-handling middleware from Phase 1.
- **Empty/loading/error states audit**: every client-fetching screen on
  web (31) and mobile (29) was checked against the loading/empty/error
  pattern the codebase already used correctly almost everywhere. Fixed
  every gap found: six web screens had a nested sub-list (directory
  members, the documents folder sidebar, drawing revision history,
  meeting action items, RFI responses, submittal packages) that was
  never distinguished from "still loading." Mobile had two distinct
  gaps -- the three offline-first list screens (daily log, punch list,
  inspections) initialized their list state as `[]` instead of `null`
  (so there was no way to tell "still reading local DB" from "genuinely
  empty") with no `.catch` on the local read; and four local-write call
  sites (`daily-log/new`, `punch-list/new`, and the answer/complete
  actions on `daily-log/[logId]` and `inspections/[inspectionId]`) had
  `try/finally` with no `catch`, so a local-DB failure was an unhandled
  rejection with no user-visible error.
- **Deployment docs & backup/restore runbook**:
  `docs/DEPLOYMENT.md` covers provisioning Postgres (why the RLS-setup
  migration step isn't optional), hardening every `.env.example`
  default for production, building/running each app, wiring an external
  cron to the two `/internal/*` endpoints with example crontab entries,
  and mobile distribution via EAS (`apps/mobile/eas.json` added, since
  none existed). `docs/BACKUP_RESTORE.md` treats the Postgres database
  and the S3-compatible attachment bucket as one recovery unit (since
  `attachments.storage_key` makes them inseparable), and its restore
  procedure is grounded in how `packages/db/src/migrate.ts` actually
  works rather than a generic checklist: because Postgres roles are
  cluster-level, a fresh cluster's restored data has tables but no
  `siteops_app` login role, so the documented fix is running the
  project's own migration tool against the restored database -- the
  exact same code path that sets up a brand-new environment, not a
  separate, untested procedure.

**Scope decisions:**
- The E2E suite covers five core workflows, not every screen -- chosen
  as the highest-value, highest-risk paths (auth, the two most-used
  field workflows, a cross-module conversion, and permission-sensitive
  dashboard gating) rather than a shallow smoke test of all ~60 routes.
- The performance pass targeted the dominant query shape (project-scoped
  lists) that virtually the whole schema shares, rather than
  micro-optimizing every individual endpoint.
- Mobile's error boundary and empty/loading/error fixes were verified by
  `tsc`/`eslint` only, same standing limitation as every prior phase's
  mobile work (no simulator/device in this sandbox).

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package after each of the seven Phase 8 commits.
- The full Playwright E2E suite (7 specs across the 5 areas above) run
  against live `apps/api` + `apps/web` + Postgres, passing consistently
  across multiple full runs.
- The index migration's performance claims are backed by
  `perf-check.ts`'s actual `EXPLAIN ANALYZE` output (recorded in
  `docs/PERFORMANCE.md`), not estimated.
- The error boundary was proven against a genuine thrown error (see
  above), not just present in the code.

## Design system: Skeuomorphism redesign (post-Phase 8)

A second cross-cutting UI/UX pass, requested outside the phase plan:
replacing the Neubrutalism visual language (thick flat ink borders, hard
0-blur offset shadows) with Skeuomorphism -- soft multi-layer shadows,
glossy gradients, and recessed input fields -- on the same maroon / navy
/ orange / ink / cream palette. A visual-language change, not a rebrand.

**How it was done without touching every file:** the Neubrutalism build
already composed its look from a handful of named tokens
(`border-3`, `shadow-brutal*`, `.brutal-panel`/`.brutal-interactive` on
web; `brutalShadow()`/`borders.thick` on mobile) that every screen
referenced by hand. Retexturing those tokens' *values* -- `border-3`
from 3px to 1px, `shadow-brutal*` from a hard offset to a soft blurred
shadow with a glossy inset highlight, plus new `shadow-brutal-inset`
(pressed-button look) and `shadow-focus` (a visible focus ring, since
the softened shadow alone reads too faint for that) -- reskinned the
whole app without renaming anything; a rename would have meant
re-editing every call site for zero visual gain. `globals.css` also
gained a subtle paper-toned body gradient and a recessed inset shadow on
every input/select/textarea globally.

Gradients aren't expressible through a single retextured token the same
way shadows are, so a scripted two-pass repaint converted every solid
button/panel background across ~40 web files to a matching gradient
(primary maroon buttons, secondary orange buttons, white panels now
white-to-cream, info/error banners), with `Header.tsx` hand-polished
beyond the mechanical pass for its gradient toolbar and logout button.

**Mobile gap, documented rather than papered over:** React Native's
shadow API (iOS `shadowColor`/`Offset`/`Opacity`/`Radius`, Android
`elevation`) has no inset-shadow or multi-layer support the way CSS
`box-shadow` does. Rather than reach for a shadow or gradient library
this app doesn't otherwise need, `theme.ts`'s `brutalShadow()` now
returns the closest native equivalent (a soft blurred drop shadow), and
a scripted pass thinned every hardcoded `borderWidth: 3` and added that
same soft-shadow treatment (plus an explicit white background, since RN
shadows need an opaque backdrop to render reliably) to every bare-
bordered "card" style that had no shadow at all before. Mobile buttons
stay flat-colored rather than gradient -- documented in `theme.ts`'s
file-level comment as a scoped simplification, not silently incomplete.

**Verification:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
all green across every package, and the full Phase 8 E2E suite (7
specs) passed unchanged before and after -- the redesign only touched
class names and style values, never markup structure or text content.
All 30 distinct web pages were screenshotted live off the running app
(real seeded and accumulated demo data) and delivered as a gallery.
Mobile changes are typecheck/lint-verified only, the same standing
mobile-visual-verification limitation as every prior phase and the
Neubrutalism pass before it -- an attempt to stand up Expo's web target
for real mobile screenshots surfaced three unrelated pnpm/Metro module-
resolution incompatibilities in a bundling path this project has never
used, and was reverted cleanly rather than pulled further into
infrastructure work outside this pass's scope (`git status` confirmed
zero leftover diff from the attempt).

## Phase 9 gate report

**Gate** (self-defined -- see the Phase 9 checklist entry above): create
a schedule task and move it through not_started → in_progress →
complete on web; log a safety incident, investigate it, and close it
with a corrective action on record; log a safety observation and
resolve it; and confirm every seeded role sees exactly the
schedule/safety access level its permission template already assigns.
**— PASSED**, see Verification.

**What was built:**
- **Schema**: two new tables. `schedule_tasks` (`packages/db/src/schema/
  schedule.ts`) -- name, description, start/end date, `assignedCompanyId`,
  `sortOrder`, `percentComplete`, and a `status` enum
  (not_started/in_progress/complete/delayed). `safety_incidents` and
  `safety_observations` (`packages/db/src/schema/safety.ts`) --
  incidents carry severity (near_miss/minor/serious/critical),
  description, optional involved company + injured person name, a
  status enum (open/investigating/closed), and `correctiveAction`/
  `closedBy`/`closedAt`; observations are the lighter-weight sibling
  (category: unsafe_condition/unsafe_act/near_miss/good_catch, status:
  open/resolved) with no investigation workflow. Both are direct
  `project_id`-scoped tables, so they only needed adding to the generic
  `direct_project_tables` RLS loop (`001_rls_and_functions.sql`) rather
  than any new policy code. Migrations `0011`/`0012` generated and
  applied cleanly against the dev database.
- **Status transition rules**: `packages/shared/src/schemas/
  schedule.schema.ts` and `safety.schema.ts` each export a
  `Record<Status, readonly Status[]>` transition table, enforced
  server-side (409 on an invalid edge) the same way every other
  status-driven module in this codebase already works. Schedule's table
  models a manual progress signal, not an approval chain -- any status
  can reach any other (e.g. a delayed task moving straight back to
  in_progress) rather than a strict linear sequence. Safety incidents
  require `correctiveAction` specifically when transitioning to
  `closed` (422 without it, checked in the service layer since it
  depends on the target status, not just the schema shape) and can
  reopen from closed; observations are a simple open/resolved toggle.
- **API**: `schedule.service.ts`/`schedule.routes.ts` (create, list,
  patch for percent-complete/details, status transition) and
  `safety.service.ts`/`safety.routes.ts` (create + list + transition for
  incidents; create + list + toggle-resolved for observations), wired
  into `app.ts` at `/schedule-tasks`, `/safety-incidents`, and
  `/safety-observations`. No new permission-engine code was needed --
  Phase 1 had already scaffolded `schedule` and `safety` into `MODULES`
  and every seeded role's `DEFAULT_ROLE_TEMPLATE_LEVELS` ahead of need
  (`project_manager`: admin on schedule, standard on safety;
  `safety_officer`: read on schedule, admin on safety; most other roles
  read-only on both), so this phase's job was proving that plumbing
  actually gates two new modules, not building it.
- **Web**: `/projects/[id]/schedule` (list with an inline create form and
  a percent-complete progress bar per task, matching the RFI list's
  inline-form pattern) and `/schedule/[taskId]` (detail with a percent-
  complete slider + save, and status-transition buttons driven directly
  off `SCHEDULE_TASK_STATUS_TRANSITIONS` the same way the RFI detail
  screen drives its buttons off `RFI_STATUS_TRANSITIONS`). `/safety`
  (incidents list, the default view, with a link across to
  `/safety/observations`) and `/safety/[incidentId]` (detail with
  transition buttons plus a corrective-action textarea that only appears
  when a transition to `closed` is available, disabled until non-empty
  text is entered -- the UI enforces the same rule the API enforces,
  rather than letting a user hit the 422 blind). `/safety/observations`
  (list with inline create + a per-row resolve/reopen toggle button).
  Both `ProjectTabs` and the `en`/`ar` message catalogs got `schedule`/
  `safety` entries alongside the rest of the nav.
- **Mobile**: view-only screens for both modules, the same standing
  scope line every T2/T3 module has drawn on mobile since Phase 4 --
  `/schedule` (list with a progress bar) + `/schedule/[taskId]` (detail),
  `/safety` (incidents list, linking to `/safety/observations`) +
  `/safety/[incidentId]` (detail), and `/safety/observations` (list).
  Each carries the same `viewOnlyNote` banner pattern already used by
  every other view-only mobile module, added to both project-home link
  lists and `lib/i18n.ts`'s `en`/`ar` translation tables.

**Scope decisions:**
- No dependency graph, critical path, or Gantt-style scheduling logic --
  Schedule here is a flat task list with dates and a manual
  percent-complete, matching the phase plan's explicit scope cut.
- `safety_incidents`/`safety_observations` are deliberately not unified
  with the existing Daily Log quick-capture safety notes
  (`daily_log_safety_incidents` from Phase 1/T1) -- the two lists don't
  cross-populate each other in v1. Documented in a code comment on the
  `safetyIncidents` table definition and in `docs/DATA_MODEL.md` §13,
  not a silent gap.
- Mobile stays view-only, consistent with every other T2/T3 module;
  verified by `tsc`/`eslint` only, the same standing mobile-visual-
  verification limitation noted in every prior phase (no simulator or
  device in this sandbox).

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (`@siteops/shared`, `@siteops/db`,
  `@siteops/api`, `@siteops/web`, `@siteops/mobile`).
- `apps/api/src/routes/schedule-safety.test.ts` (6 Supertest cases):
  the full not_started → in_progress → complete lifecycle including the
  auto-fill of `percentComplete` to 100 on completion, a rejected
  invalid transition (409), a `client_viewer` 403 on create for both
  schedule and safety, the full incident lifecycle including the 422 on
  closing without a corrective action, and an observation's create →
  resolve round trip. Full API suite: 47/47 passing.
- A new Playwright spec, `apps/web/e2e/schedule-safety.spec.ts` (3
  cases), drives the actual gate scenario end-to-end against the live
  Next.js + Express + Postgres stack: creates a schedule task and walks
  it not_started → in_progress → complete on web; logs a safety
  incident as `fadi.salameh@siteops.test` (the seeded `safety_officer`),
  investigates it, and closes it with a corrective action on record;
  logs and resolves a safety observation. Full E2E suite: 10/10 passing
  (the prior 7 Phase 8 specs unchanged plus these 3).
- The permission-gating clause of the gate was confirmed two ways
  rather than re-tested per role from scratch: the API test suite's
  `client_viewer` 403 on both `POST /schedule-tasks` and
  `POST /safety-incidents` proves the generic permission engine (already
  fully tested in Phase 1) correctly reads the Phase-1-scaffolded
  `schedule`/`safety` entries in `DEFAULT_ROLE_TEMPLATE_LEVELS`; and the
  E2E spec's use of `project_manager` (schedule admin) vs
  `safety_officer` (safety admin) for the respective create+transition
  flows exercises the two roles that actually own each module day to
  day.

## Phase 10 gate report

**Gate** (self-defined -- see the Phase 10 checklist entry above): create
a T&M ticket with labor, equipment, and material entries, confirm the
total is computed correctly, and move it through draft → submitted →
approved on web (and separately, reject one and confirm it requires a
rejection reason and can return to draft); log a piece of correspondence
and move it through draft → sent → acknowledged → closed; and confirm a
subcontractor only sees T&M tickets billed under their own company and
correspondence where their own company is sender or recipient.
**— PASSED**, see Verification.

**What was built:**
- **Schema**: `tm_tickets` (`packages/db/src/schema/tm-correspondence.ts`)
  -- server-numbered `ticketNumber` (`TM-0001`), `companyId` (the sub
  billing the work), `workDate`, `description`, a
  draft/submitted/approved/rejected `status`, and
  submitted/approved/rejection bookkeeping columns -- plus three child
  tables (`tm_ticket_labor_entries`, `tm_ticket_equipment_entries`,
  `tm_ticket_material_entries`), mirroring the Daily Log's existing
  manpower/equipment child-table pattern rather than inventing a new
  shape. `correspondence` -- server-numbered `correspondenceNumber`
  (`COR-0001`), `direction` (incoming/outgoing), `type`
  (letter/notice/transmittal/memo), `fromCompanyId`/`toCompanyId`, and a
  draft/sent/acknowledged/closed `status`. Both are direct
  `project_id`-scoped tables added to the generic `direct_project_tables`
  RLS loop; the three T&M child tables were added to the child-table RLS
  loop the same way Daily Log's and Meetings' child tables already are.
  Migration `0013` generated and applied cleanly.
- **Two new hard-rule RLS policies**, beyond the generic project-member
  scoping every table gets: `tm_tickets_subcontractor_scope` restricts a
  `subcontractor` role to only the T&M tickets billed under their own
  company (a T&M ticket is a sub's own billing record, not a
  project-wide document like an RFI, so it gets stricter scoping than
  the RFI ball-in-court/distribution pattern); `correspondence_subcontractor_scope`
  restricts a `subcontractor` to correspondence where their own company
  is sender or recipient, adapting the RFI rule's shape to a from/to pair
  instead of ball-in-court/distribution. Both follow the exact
  `AS RESTRICTIVE` pattern `rfis_subcontractor_scope` already established
  in Phase 4 -- no new RLS mechanism, just two more instances of it.
- **Numbering**: `formatTmTicketNumber`/`formatCorrespondenceNumber`
  added alongside the existing RFI/CO/PI/submittal/commitment formatters
  in `packages/shared/src/business-rules/numbering.ts`, with their own
  unit tests -- same server-side `next_sequence_number()` allocation
  every other numbered record uses (CLAUDE.md rule 12).
- **Status transition rules**: `TM_TICKET_STATUS_TRANSITIONS` and
  `CORRESPONDENCE_STATUS_TRANSITIONS`, enforced server-side (409 on an
  invalid edge, same as every other status-driven module). A T&M ticket
  requires a `rejectionReason` specifically when transitioning to
  `rejected` (422 without it, checked in the service layer since it
  depends on the target status -- the same pattern Phase 9's safety
  incident used for its corrective-action requirement) and a rejected
  ticket can return to `draft` for resubmission; `approved` is terminal.
  Correspondence's `sent` can go straight to `acknowledged` or `closed`
  (not every letter needs a formal acknowledgment), and `closed` can
  reopen back to `sent` if follow-up is needed.
- **API**: `tm-ticket.service.ts`/`tm-ticket.routes.ts` (create with
  nested labor/equipment/material entries in one call, list, get-detail
  with a service-computed `totalAmount` -- summed from the entries,
  never stored redundantly -- and status transition) and
  `correspondence.service.ts`/`correspondence.routes.ts` (create, list,
  status transition), wired into `app.ts` at `/tm-tickets` and
  `/correspondence`. Both modules' permission checks use "standard"
  uniformly across create/transition, matching the codebase's existing
  convention (e.g. change order approval) of letting the permission
  *level* gate the module while business rules -- not a second
  permission tier -- gate specific transitions.
- **Attachments**: `tm_ticket` and `correspondence` owner types added to
  `attachment.service.ts`'s `OWNER_TYPE_MODULES` map (two-line addition,
  reusing the existing generic pre-signed-upload attachment system
  rather than building anything new) so both modules can carry file
  attachments through the same flow photos/documents/inspections already
  use.
- **Web**: `/projects/[id]/tm-tickets` (list with an inline create form
  that supports adding any number of labor/equipment/material rows
  before submitting, matching the RFI list's inline-form pattern scaled
  up for three repeatable sub-sections) and `/tm-tickets/[ticketId]`
  (detail showing every entry, the computed total, status-transition
  buttons, and a rejection-reason textarea that only appears when a
  transition to `rejected` is available, disabled until non-empty text
  is entered -- the same "UI enforces what the API enforces" pattern
  Phase 9's safety-incident closure used). `/projects/[id]/correspondence`
  (list with inline create) and `/correspondence/[correspondenceId]`
  (detail with transition buttons). Both wired into `ProjectTabs` and the
  `en`/`ar` message catalogs.
- **Mobile**: view-only screens for both modules, the same standing scope
  line every T2/T3 module has drawn on mobile since Phase 4 --
  `/tm-tickets` (list) + `/tm-tickets/[ticketId]` (detail showing every
  entry and the total) and `/correspondence` (list) +
  `/correspondence/[correspondenceId]` (detail). Each carries the
  standard `viewOnlyNote` banner, added to both project-home link lists
  and `lib/i18n.ts`'s `en`/`ar` translation tables.

**Scope decisions:**
- Module tier #16 in the original module list is named "T&M Tickets /
  Field Productivity" -- only the T&M ticket concept (time-and-material
  billing records) was built. "Field Productivity" (daily production-rate
  tracking, e.g. units installed per crew-hour against an estimate) is a
  distinct feature with its own data model and wasn't part of the
  original brief's detail; out of scope for this phase, not silently
  dropped.
- A T&M ticket does not auto-generate or auto-link to a change order or
  commitment line -- it stands alone as billing backup in v1, the same
  "no auto-linking" simplification Phase 9 drew for schedule tasks vs.
  the dependency graph. A future phase could wire "convert approved T&M
  tickets into a change order" the same way Phase 2's punch list already
  converts from a failed inspection item.
- Correspondence doesn't model distribution lists (cc'ing multiple
  companies) the way RFIs do -- it's a strict one from-company/one
  to-company record, matching how a physical letter or transmittal
  actually works, rather than RFI's multi-party cc model.
- Mobile stays view-only, consistent with every other T2/T3 module;
  verified by `tsc`/`eslint` only, the same standing mobile-visual-
  verification limitation noted in every prior phase.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package.
- `apps/api/src/routes/tm-correspondence.test.ts` (7 Supertest cases):
  the full T&M ticket lifecycle including entry-total computation
  (labor + equipment + material, hand-verified against the seeded
  amounts), the reject-without-reason 422 and successful
  reject-then-back-to-draft path, a subcontractor-scoping check proving
  one sub's ticket is invisible to a different sub, and a
  `client_viewer` 403 on create; the full correspondence lifecycle, its
  own subcontractor-scoping check, and confirmation `client_viewer` can
  read but not create correspondence. Full API suite: 54/54 passing.
- A new Playwright spec, `apps/web/e2e/tm-correspondence.spec.ts` (2
  cases), drives the actual gate scenario end-to-end against the live
  Next.js + Express + Postgres stack: creates a T&M ticket with a labor
  entry, confirms the displayed total matches the hand-computed
  hours×rate, and walks it draft → submitted → approved; creates a piece
  of correspondence and walks it draft → sent → acknowledged → closed.
  Full E2E suite: 12/12 passing (the prior 10 specs unchanged plus these
  2).
- The subcontractor-scoping clause of the gate was verified directly
  (not inferred): the API test suite creates one T&M ticket per
  subcontractor company and confirms each sub's ticket list excludes the
  other's, and the same check for correspondence -- proving the two new
  `AS RESTRICTIVE` RLS policies actually filter rows, not just that the
  permission-template plumbing is present.

## Phase 11a gate report

**Gate** (self-defined -- see the Phase 11a checklist entry above, per
Addendum A / `docs/SCHEDULING.md`): import a real 1,000+ task P6 file,
re-import a revised version, prove existing RFI links survive.
**— PASSED against a synthetic 1,200-task P6 XER file** (no real
Primavera export was available to this build -- generated
programmatically in the test itself, the same precedent Phase 8's
`perf-check.ts` set for synthetic-but-realistic scale testing), see
Verification.

**What was built:**
- **Naming**: Phase 9's flat-list Schedule module's `schedule_tasks`
  table was renamed to `manual_schedule_tasks` (migration 0014, a proper
  `ALTER TABLE ... RENAME`, not a drop/recreate -- the 14 seeded rows
  were verified to survive the rename byte-for-byte) to free the
  `schedule_tasks` name for this phase's fundamentally different,
  versioned model. Only the SQL table name changed; the Drizzle TS
  export (`scheduleTasks`) and every field name are untouched, so none
  of Phase 9's API/web/mobile code needed to change -- that module stays
  live and fully functional exactly as shipped.
- **Schema** (`packages/db/src/schema/cpm-schedule.ts`, migrations
  0015-0016): `schedules` (one per project), `schedule_versions`
  (immutable once superseded -- a re-import always creates a new
  version), `schedule_tasks` (the new versioned CPM model -- WBS
  hierarchy via self-referencing `parent_task_id`, full early/late/
  planned/actual date set, float, criticality, constraints),
  `task_dependencies` (FS/SS/FF/SF with lag), `calendars` +
  `calendar_exceptions` (defaulting to Sun-Thu working, never Mon-Fri --
  docs/SCHEDULING.md A10), `task_baseline_values` and `lookahead_plans`/
  `lookahead_commitments` (schema only, unused until Phase 11c/d). RLS:
  `schedules`/`calendars`/`lookahead_plans` are direct `project_id`
  tables; everything else is scoped transitively through its parent
  (`schedule_tasks` → `schedule_versions` → `schedules` → project
  membership) using the same generic child-table RLS loop every other
  module's child tables already use -- verified directly with a
  manual multi-level RLS probe (insert through the full chain as a real
  project member, confirm visibility, confirm cleanup), not just
  assumed to compose correctly.
- **Shared types & validation** (`packages/shared/src/schedule/`):
  `ParsedSchedule` -- the one shape every importer normalises to
  (tasks, dependencies, calendars, data date, warnings) -- plus
  `validateParsedSchedule()`, a pure function every importer runs before
  returning: negative-duration rejection, orphaned-predecessor
  rejection, and DFS-based circular-dependency detection that returns
  the actual cycle chain (not just a boolean), per Addendum A4's "return
  the participating task chain, do not throw a generic error."
  Calendar-aware CPM date math (`workingTimeAdd`/`workingTimeBetween`)
  was scoped out of this phase deliberately -- Tier A only displays a
  source tool's own already-computed dates/float, it doesn't recompute
  them; that math is Tier B/Phase 11d's problem, built against the
  25-scenario golden-file suite Addendum A4 specifies, not half-built
  here without one.
- **Four importers**, each a pure function with its own fixture file and
  unit tests under `packages/shared/src/schedule/importers/` and
  `packages/shared/fixtures/schedules/`:
  - **CSV** (`csv.ts` + a hand-rolled dependency-free `csv-text.ts` RFC
    4180-ish parser -- CLAUDE.md rule 10 flagged rather than pulling in
    a library for something this simple). Header-name guessing with
    common synonyms, or an explicit column mapping for the guided-UI
    path a later phase builds.
  - **MS Project XML** (`ms-project-xml.ts`, using `fast-xml-parser` --
    a new dependency, flagged per CLAUDE.md rule 10: ~30KB, no
    transitive dependencies, MIT-licensed). Outline-level-based WBS
    hierarchy reconstruction, ISO-8601 duration parsing, MSP's
    numeric constraint/dependency-type codes.
  - **Primavera P6 XER** (`p6-xer.ts` + a generic `xer-text.ts`
    tab-delimited-table parser). PROJWBS rows become synthetic `"wbs"`-
    type tasks so P6's separate WBS table has a place in the same flat
    task list MSP's outline levels use. Scope cut, documented in the
    code and in `docs/DATA_MODEL.md`: P6's `clndr_data` field (a nested
    mini-language encoding a calendar's actual working days/hours/
    exceptions) is not parsed -- every P6 calendar defaults to Sun-Thu
    working rather than reading its real pattern.
  - **P6 XML** (`p6-xml.ts`, also via `fast-xml-parser`) -- P6's native
    `APIBusinessObjects` export format, following its real
    `ObjectId`/`<Entity>ObjectId` foreign-key convention.
  - All four formats' field names/enum codes are reconstructed from
    training-data memory of each published schema, not verified against
    a live reference (none was accessible in this sandbox) -- flagged
    inline in each file's header comment as the first place to check if
    a real export behaves differently on some field.
- **Version diffing** (`packages/shared/src/schedule/diff.ts`):
  `diffScheduleVersions()`, a pure function matching a re-imported
  task back to its previous-version counterpart by `externalId`, then
  `wbsCode`, then an exact case-insensitive name match (Addendum A2's
  specified fallback chain), classifying each as added / removed /
  re-dated (with a day-shift count) / re-logicked (predecessor set
  changed) / progress-changed.
- **API** (`apps/api/src/services/cpm-schedule.service.ts` +
  `cpm-schedule.routes.ts`, mounted at `/schedules`): `POST /schedules/
  import` dispatches to the right importer by `sourceTool`, creates or
  reuses the project's one `schedules` row, inserts a new
  `schedule_versions` row plus every task/dependency/calendar, resolves
  the self-referencing WBS hierarchy in a second pass once every task
  has a real row id, and -- on a re-import -- runs the diff against the
  previous current version and returns it in the response. `GET
  /schedules` and `GET /schedules/versions/:versionId/tasks` for
  reading a project's schedule state back out.
- **Record linkage, and the actual "links survive" mechanism**:
  `record_links` (a generic polymorphic table that has existed since
  Phase 1 but had zero API wiring until now, per a pre-existing
  documented gap -- it has no RLS, authorization instead lives in the
  new `record-links.service.ts` keyed off which module a link's source/
  target type belongs to) got its first real endpoints:
  `POST /record-links` and `GET /record-links`. The actual gate
  behaviour -- "an RFI linked to activity T500 keeps working after a
  re-import" -- isn't free just because `externalId` matching exists:
  a re-import creates entirely new `schedule_tasks` rows even for an
  unchanged activity (each version's rows are immutable), so a link
  created against v1's row for T500 would otherwise dangle once v2
  exists. `importSchedule()` closes that gap explicitly: after inserting
  the new version's tasks, it finds every `record_links` row whose
  `target_id` points at a v1 task with a matching `externalId` in v2,
  and rewrites `target_id` to the new row. This was verified by literal
  assertion, not just by reasoning about it (see Verification).

**Scope decisions:**
- **No web or mobile UI this phase** -- the Gantt UI (including any
  import form) is Addendum A's own Phase 11b, not 11a. `docs/SCHEDULING.md`
  and this gate report are the only user-facing surface of this phase's
  work; a project manager can't yet click anything to import a schedule.
- **XLSX binary decoding is deferred.** The CSV importer's pure
  `parseScheduleRows()` function already accepts pre-parsed tabular rows
  regardless of source, so an XLSX-to-rows step (via the `xlsx`/SheetJS
  library) is a thin addition -- but it belongs at the API layer, not in
  `packages/shared`, since that library shouldn't ship in the browser
  bundle `packages/shared` is also consumed by. Deferred to whichever
  phase builds the upload UI and needs it end-to-end.
- **Import runs synchronously**, not as a background job with progress
  feedback the way Addendum A2 specifies at 5,000-task scale. At this
  phase's ~1,000-task gate scale it measured well inside the 10-second
  bar in practice (see Verification) -- a background-job version is a
  reasonable follow-up once real usage approaches thousands of tasks,
  not something worth building speculatively against a scale this phase
  doesn't yet need to hit.
- **`clndr_data`/`<StandardWorkWeek>` parsing is out of scope** (see
  above) -- every calendar's actual working-day pattern from P6 is
  discarded in favor of a Sun-Thu default. `calendar_exceptions` stays
  empty until a later phase reads that data for real.
- **`task_baseline_values` and `lookahead_plans`/`lookahead_commitments`
  are schema-only** -- nothing writes to them yet. They exist now so
  Phase 11c/d don't need a schema migration of their own to get started.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package, including a from-scratch full monorepo build
  (not just the changed packages) to confirm the new `fast-xml-parser`
  dependency doesn't leak into the web bundle -- `apps/web`'s "First
  Load JS shared by all" stayed at 106 kB, unchanged from before this
  phase, confirming the importers are never reachable from any client
  component.
- `packages/shared`: 93/93 tests passing, including dedicated fixture-
  based tests for all four importers (CSV, MS Project XML, P6 XER, P6
  XML) plus the shared validator and version-diff logic (cycle
  detection on a direct two-task cycle, a longer three-task cycle, and
  a diamond-shaped dependency graph correctly *not* flagged as a false
  positive).
- `apps/api/src/routes/cpm-schedule.test.ts` (3 Supertest cases): the
  full gate scenario end to end -- generates a synthetic 1,200-activity
  P6 XER file (1 WBS node + 1,200 chained activities), imports it
  (measured at ~1.6-3.5s across repeated runs, comfortably under the
  10-second bar), links a real RFI to activity T500, re-imports a
  revised version (one activity removed, one added, the last 100
  surviving activities' dates shifted 10 days later, every 10th
  activity's progress changed), and asserts on the returned diff
  (`added`/`removed`/`reDated`/`progressChanged` all non-empty and
  correctly sized) -- then explicitly re-fetches the RFI's links and
  asserts the link's `target_id` now points at T500's *new* row in v2,
  not the v1 row it was created against. A second test confirms a
  circular-dependency file is rejected (400); a third confirms
  `client_viewer` cannot import (403). Full API suite: 57/57 passing,
  confirmed idempotent by running it twice in a row against the same
  seeded dev database (the schedule-versioning test cleans up its own
  project's schedule state in `beforeAll`/`afterAll`, since -- unlike
  every other test file in this suite -- it asserts on an absolute
  version sequence rather than uniquely-named records, and the seeded
  project's `schedules` row would otherwise carry state across runs).
- The full Playwright E2E suite (12 specs, unchanged from Phase 10) was
  re-run twice to confirm zero regressions from this phase's changes,
  which touched no web or mobile code at all.

## Phase 11b gate report

**Gate** (self-defined — see the Phase 11b plan: task grid + canvas
timeline with zoom/critical path/dependencies, filters, PNG export,
verified at a genuine 5,000-task scale) **— PASSED**, see Verification.

**What was built:**
- **`lib/gantt/`** (`apps/web`): `types.ts` (`GanttTask`/`GanttRow`/
  `GanttDependency`), `tree.ts` (`flattenWbsTree()` — depth-first,
  collapse-aware flattening of the WBS hierarchy into the flat indexed
  row list a virtualized grid needs), `timescale.ts` (`ZoomLevel`,
  `dateToX`/`xToDate`, `generateTicks()`, plus `taskDateRange()` and
  `timelineEnd()` added this phase for the timeline's bar geometry and
  axis range), `filter.ts` (`applyGanttFilters()` — search/critical-
  only/company, keeping every matched task's full WBS ancestor chain so
  a match buried under a collapsed-looking summary row stays reachable),
  `api.ts` (maps an API task row to `GanttTask`), `constants.ts`
  (`ROW_HEIGHT`/`HEADER_HEIGHT`/`GRID_WIDTH`, shared so the grid and
  timeline panes stay pixel-aligned), `useViewportHeight.ts`.
- **`TaskGrid.tsx`**: the left pane — a `react-window` v2 virtualized
  list (`List`/`rowComponent`/`useListRef`, a materially different API
  from v1), WBS-indented rows with collapse/expand, a milestone marker,
  critical-path row tinting, localized column headers, and a
  `TaskGridHandle` ref exposing the list's real scrollable DOM element
  and `scrollTop`.
- **`Timeline.tsx`**: the right pane — a canvas sized to the *viewport*,
  not the full schedule, redrawn on scroll/zoom rather than allocated at
  full content size (a multi-year schedule at day-zoom could otherwise
  demand a canvas tens of thousands of pixels wide). Vertical scroll is
  driven entirely by `TaskGrid`'s real `scrollTop` (passed down as a
  prop) — the timeline has no vertical scrollbar of its own, so the two
  panes can never drift out of sync. Horizontal scroll is the canvas's
  own, via a "sticky canvas" trick: a wide, empty content `div` (sized to
  the schedule's actual date range) drives a native scrollbar inside an
  `overflow-x: auto` container, while the visible `<canvas>` inside it is
  `position: sticky; left: 0` and stays visually pinned as that container
  scrolls — the live `scroll` event's `scrollLeft` is read and used to
  translate what the canvas draws, so the (viewport-sized) canvas itself
  never needs resizing on scroll. Draws task/milestone/summary bars
  (critical-path tint, a progress-fill overlay, WBS/summary rows as a
  thin bracket shape with downward end-caps), dependency arrows (FS
  elbow connectors with an arrowhead), and zoom-level ticks (day/week/
  month/quarter/year, via `generateTicks()`). Exposes a
  `TimelineHandle.exportPng()` imperative
  method for the PNG export button.
- **`ScheduleImportForm.tsx`** + **`/projects/[id]/gantt` page**: wires
  everything together — loads the project's current schedule version via
  Phase 11b's own `GET /schedules/current` endpoint (built in the
  API task before this one), shows the import form when there isn't one
  yet (source-tool picker + file input, `FileReader.readAsText` → `POST
  /schedules/import`), a version/zoom/filters/export/re-import toolbar
  once there is, and a "Gantt" tab in `ProjectTabs`. Full English/Arabic
  i18n, including the grid's own column headers (initially hardcoded,
  caught during manual RTL verification and fixed — see below).
- **Filters + PNG export**: a search box, a critical-path-only checkbox,
  and a responsible-company dropdown (reusing the existing `GET
  /projects/:id/companies` endpoint Phase 6's Schedule screen already
  uses — no new lookup endpoint needed). "Export PNG" composites a fresh
  off-screen canvas: the grid's visible rows redrawn as text (name/dates/
  percent, matching `TaskGrid`'s layout) in the left column, then the
  timeline's *already-rendered* live canvas frame copied in via
  `drawImage` for the right side — reusing the current frame instead of
  recomputing bars/ticks/dependencies from scratch for the export.

**Two real bugs the scale gate caught (not hypothetical — both
reproduced, fixed, and regression-tested):**
1. **Stack overflow on a long dependency chain.** Phase 11a's
   `findCycle()` (`packages/shared/src/schedule/validate.ts`) used a
   recursive `visit()` for its DFS cycle detection. A P6/MSP export
   chaining thousands of activities FS-to-FS in one unbroken run — which
   is normal, not pathological, schedule shape — blew the call stack
   (`RangeError: Maximum call stack size exceeded`) well before this
   phase's 5,000-task bar; Phase 11a's own gate test only exercised
   1,200 tasks and never hit it. Fixed by rewriting `findCycle()`
   iteratively (an explicit frame stack standing in for the recursive
   call), with identical return semantics. Regression-tested at 20,000
   tasks, both the non-cyclic case (must not throw) and a cycle planted
   at the far end of the chain (must still be found and reported
   correctly).
2. **Postgres's 65,534-bound-parameter limit.** `importSchedule()`
   (`apps/api/src/services/cpm-schedule.service.ts`) built one
   un-chunked `INSERT` for all of a version's tasks (23 columns each)
   and another for all its dependencies. At 5,001 tasks that's over
   115,000 parameters in a single statement — Postgres rejected it
   outright (`MAX_PARAMETERS_EXCEEDED`) — again, something Phase 11a's
   1,200-task gate never approached. Fixed with a generic `chunk()`
   helper batching both bulk inserts into groups of 1,000 rows.

Both were found by actually running a 5,000-task import against a real
Postgres instance and a real browser, not by inspecting the code — the
scale gate did its job.

**Scope decisions:**
- **PNG export captures the currently visible view, not the whole
  schedule.** Rasterizing every row of a 5,000+ task schedule at once
  (height = row count × 32px, width = full date range at whatever zoom
  is active) risks an enormous, possibly browser-crashing canvas
  allocation for exactly the schedules where export matters most. This
  phase exports what's on screen — current scroll position, current
  zoom — which is both safe at any scale and matches what "export the
  view" buttons typically do elsewhere. A "export the full schedule"
  mode (necessarily paginated or scaled down) is a reasonable follow-up,
  not built speculatively here.
- **Dependency arrows are drawn only when both endpoints are within the
  currently rendered row range** — bounded by viewport size the same
  way the grid and bar-drawing already are, not by total dependency
  count. An off-screen predecessor/successor pair simply isn't drawn
  until scrolled into view together.
- **No PDF, XLSX, or MS-Project/P6-XML export.** Addendum A's own
  11b gate specified "a plotted PDF is legible at A1" — this phase
  scoped that down to "filters + PNG export" instead. A true-to-scale
  A1 PDF plot needs physical-dimension calibration (paper size, DPI,
  margins) that a screen-resolution PNG doesn't, and is a meaningfully
  different deliverable, not a small addition on top of what's built
  here. Other export formats stay a documented gap for whichever later
  phase needs them.
- **Filters cover search/critical-path/company only** — no trade,
  location, or cost-code filter yet. `applyGanttFilters()`'s shape makes
  adding one a small, additive change whenever it's needed.
- **No native CPM engine, no calendar-aware date math** — Tier B,
  unchanged from Phase 11a's scope note, deferred to Phase 11d.
- **No look-ahead/PPC UI** — Phase 11c.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (175 tests total: 95 `packages/shared`, 57
  `apps/api`, 22 `apps/web`, 1 `packages/db`), including a full
  production `next build` of `apps/web` (the `/gantt` route compiles at
  10.7 kB, `react-window` included, shared bundle unchanged at 106 kB).
- New unit tests this phase: `lib/gantt/filter.test.ts` (6 cases,
  including the ancestor-preservation behaviour on a deeply nested
  match), `lib/gantt/timescale.test.ts` extended with `taskDateRange`/
  `timelineEnd` (6 new cases), plus the two `validate.test.ts` scale
  regressions above.
- **The 5,000-task scale gate itself**, run end to end against the real
  dev API and a real Chromium browser (not the isolated Supertest app —
  this phase's gate is about the UI, not just the import path already
  proven at 1,200 tasks in Phase 11a): a synthetic 5,000-activity P6 XER
  file (one unbroken FS chain under one WBS node, the worst case for
  both bugs above) was imported and the resulting Gantt page driven
  through every interaction this phase built —
  - Import (server-side, 5,001 rows incl. the WBS node): **~5.0s**,
    comfortably inside the 10-second bar carried over from Phase 11a.
  - Login → navigate → fetch (a 4.65 MB JSON payload) → client-side
    map/filter/flatten → first row visible on screen: **~1.1s**.
  - **Virtualization confirmed directly, not assumed**: only 23 actual
    DOM row elements existed in `TaskGrid` at any time, regardless of
    the 5,001 total tasks.
  - An 11-step full-range vertical scroll: **389ms** total. A 4-way
    zoom-level switch (day → month → year → week): **408ms**. A
    client-side search filter across all 5,001 tasks: **225ms**. PNG
    export: **44ms**.
  - Zero console errors attributable to the app (one unrelated,
    non-reproducible favicon 404 on the login page, pre-existing and
    unrelated to this phase).
- **Manual visual verification** (screenshots, not just automated
  assertions): task bars/critical-path tint/progress fill/milestone
  diamonds/dependency arrows all render correctly at day/week/month
  zoom; the sticky-canvas horizontal-scroll technique was confirmed
  against a real narrow-viewport scroll (header ticks and bars shifted
  together, the canvas itself stayed pinned); filters correctly narrow
  the grid while preserving WBS ancestors; the exported PNG is a clean,
  correctly-aligned composite of the grid-text column and the timeline's
  live frame; the Arabic/RTL layout mirrors the whole grid+timeline pane
  to the right correctly (the one bug caught here — hardcoded English
  column headers in `TaskGrid` — was fixed before this report, see
  "What was built").

## Phase 11c gate report

**Gate** (self-defined — see the Phase 11c plan, Addendum A6/A7: a
look-ahead window with a subcontractor commitment that's confirmed and
later missed (PPC reflects it), a constraint log, a delay-register
linkage, and a field progress update that only changes the schedule once
a planner accepts it — submitted from a phone, including while offline,
with an end-to-end sync round trip) **— PASSED**, see Verification.

**What was built:**
- **`packages/db`**: `lookaheadCommitments` gained a `status` enum
  (`promised`/`confirmed`/`declined`); new `scheduleConstraints` table
  (category/description/owner company/need-by date/open-or-cleared) and
  `scheduleProgressUpdates` table (proposed percent/actual-start/actual-
  finish/note/photo, `pending`/`accepted`/`rejected`, reviewer + rejection
  reason) — both scoped to a `cpmScheduleTasks` row via
  `child_fk_parent` RLS; `dailyLogDelays` gained a nullable
  `scheduleTaskId` link (the "delay linkage" A6 calls for).
- **`packages/shared`**: `filterLookaheadWindow()` (a task falls in a
  look-ahead window if its date range overlaps it, falling back from
  planned to early dates for an unbaselined task) and `computePpc()`
  (per-company met/missed/pending counts and a percentage, a commitment
  counted only once its promised finish has passed) — 13 unit tests
  covering window-overlap edge cases and PPC's met/missed/pending/multi-
  company/empty cases.
- **`apps/api`**: `lookahead.service.ts`/`.routes.ts` (ad-hoc unsaved
  look-ahead view, published plans, commitments with a self-scoped
  confirm/decline that checks the caller's own company rather than
  requiring the broader "standard" edit level, PPC, a delay register, and
  a schedule-scoped company-name lookup — see below); `schedule-
  constraints.service` folded into the same file's pattern via `POST
  /schedule-constraints` / `GET` / `POST /:id/clear`; `schedule-
  progress.service.ts`/`.routes.ts` (submit — "read" is enough, since
  submitting never mutates the schedule; a planner's accept/reject queue
  gated at "standard"; accept is the *only* place a phone submission
  actually reaches `cpmScheduleTasks`, and only the fields that were
  proposed). Direct `/accept`/`/reject` endpoints rather than a generic
  transition endpoint (like punch items'
  `PUNCH_ITEM_STATUS_TRANSITIONS`) — a progress update only ever has two
  possible outcomes from "pending", so a state-machine abstraction would
  be pure overhead.
- **Mobile sync wiring for `schedule_progress_update`**: added as a
  fourth entity type to `SYNC_ENTITY_TYPES`
  (`packages/shared/src/schemas/sync.schema.ts`), requiring (and
  receiving) a branch in each of `sync.service.ts`'s two exhaustive
  `switch` statements. `applyScheduleProgressUpdatePush()` is create-only
  — unlike daily logs, a progress update is never edited after
  submission, only accepted/rejected by a planner (a separate, non-synced
  web action) — so there's no field-merge/conflict path: a retried push
  for an already-applied `localId` is just an idempotent no-op, not a
  duplicate or a conflict. `listScheduleProgressUpdatesSince()` scopes by
  project via a join through `cpmScheduleTasks`→`scheduleVersions`→
  `schedules`, since the table itself carries no `projectId` column.
- **`apps/web`**: a `/lookahead` page (week-start/horizon picker,
  publish-plan button, tasks-in-window grouped by company, constraint
  log with add/clear, commitments with confirm/decline/PPC table, a
  progress-update submission form, a delay-register table) and a
  `/progress-updates` page (the planner's acceptance queue — accept/
  reject with an inline rejection-reason input); both added to
  `ProjectTabs`, fully bilingual.
- **`apps/mobile`**: `lib/db/schedule-progress-repo.ts` (a create-only
  local table — `id`/`taskId`/proposed fields/note, plus a
  `reviewStatus` mirrored down from the server on pull so a submitting
  device can see its own update go from "awaiting review" to "accepted"/
  "rejected" without a dedicated endpoint); the four sync-engine
  touchpoints (`ENTITY_TYPES`, `buildPushData`, `markApplied`,
  `pullEntity` — `markConflicted` gained an explicit branch that throws,
  documented as unreachable, since this entity's push handler never
  returns a `conflict` result). Three new screens under
  `/projects/[id]/lookahead/`: an index screen (this week + the next 3
  weeks' tasks, grouped by responsible company via the same schema-scoped
  `GET /lookahead/companies` lookup the web page uses, plus a "my
  submitted updates" list read from local SQLite so an offline
  submission is visible immediately); a task-detail screen (linked RFIs/
  submittals/punch items via `GET /record-links` — the **first mobile
  consumer of `record_links`**, shown as badged cards deep-linking into
  each type's existing mobile detail screen where one exists; the
  progress-update submission form, offline-queued through the outbox
  exactly like a daily log); and a commitments screen (plan picker,
  confirm/decline buttons calling the API directly — not through the
  outbox, since these are single-writer actions with no offline-conflict
  story worth building — plus the PPC table). No pre-filtering by "my
  company" anywhere a wrong-company action is attempted; the API's
  existing 403 (`not_committed_company`) is caught and shown as a
  message instead, the same pattern already proven on web.
- **A real UX bug found and fixed via manual browser verification, not
  caught by any automated test**: `GET /projects/:id/companies` is
  gated by `requireAnyFinancialReadAccess()`, which a foreman's default
  template sets to "none" — so the web look-ahead page's company names
  silently rendered as raw UUIDs for a foreman (the `.catch()` on that
  fetch swallowed the resulting 403). Fixed by adding a schedule-scoped
  `GET /lookahead/companies` endpoint instead of loosening the existing
  financial-gated one (which Budget/Commitments screens still use for
  their own, deliberately narrower purpose), with a regression assertion
  in the gate test and a re-verified screenshot. Mobile was built against
  the corrected endpoint from the start.

**Scope decisions:**
- **No photo attachment on a progress update from mobile.** The schema
  has a `photoAttachmentId` column and the API push handler accepts one,
  but photo upload is online-only (presign/confirm, per Phase 2's own
  documented scope), so it can't travel through a fully-offline outbox
  push. A field submission is data-only on mobile; attaching a photo
  after the fact would need online connectivity anyway and is left as a
  documented gap rather than a half-built online/offline hybrid.
- **Look-ahead plans publish immediately at creation** — no separate
  draft/publish workflow, unlike Addendum A6's fuller Last Planner
  system description. `createLookaheadPlan()` sets `publishedAt`/
  `publishedBy` at insert time.
- **Constraints and progress updates are not carried forward across a
  schedule re-import**, unlike `record_links` (Phase 11a). Both are
  scoped to a specific `cpmScheduleTasks` row, which is never mutated
  across versions; a re-import creates new task rows in a new version
  with no equivalent carry-forward logic. Documented here rather than
  silently left as a surprise gap.
- **Mobile "my tasks" groups by company, it doesn't filter to only the
  viewer's own company.** There's no `companyId` in the stored mobile
  auth session, and the API's own confirm/decline check already enforces
  company boundaries where it actually matters (an action, not a view) —
  mirroring the web page's identical choice.
- **No mobile constraint-log or delay-register screens.** Task #122's
  stated scope was "my-tasks list + progress capture + commitment
  confirm/decline"; constraints and the delay register are planner/PM
  tools, already fully built on web, and adding read-only mobile views of
  them wasn't part of the gate this phase set for itself.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (189 tests total: 108 `packages/shared` — 13 new
  this phase for `lookahead.ts` — 58 `apps/api` — including the sync
  round trip below — 22 `apps/web`, 1 `packages/db`, 0 `apps/mobile`,
  consistent with every phase since Phase 2), including a full production
  `next build` of `apps/web` (`/lookahead` compiles at 4.53 kB,
  `/progress-updates` at 2.57 kB).
- **The Phase 11c API gate test** (`apps/api/src/routes/lookahead.test.ts`,
  run against the Zarqa Wastewater project so it doesn't collide with
  `cpm-schedule.test.ts`'s Amman Heights fixtures): imports a small XER,
  gets the ad-hoc look-ahead view, confirms a foreman can resolve company
  names via the new schedule-scoped endpoint (the fix above, regression-
  tested), publishes a plan, creates a commitment, proves a wrong-company
  confirm attempt 403s and the right company's succeeds, records a late
  actual and asserts PPC shows exactly one missed commitment, submits a
  progress update as a foreman and confirms the task is **unchanged**
  until a planner accepts it (confirming a foreman cannot self-accept),
  asserts a double-accept 409s, and confirms a rejected update also
  leaves the task untouched; then a constraint is created (and a
  consultant is blocked from creating one), listed, and cleared; then a
  daily-log delay linked to a schedule task shows up correctly in the
  delay register.
- **The offline sync round trip itself**, folded into the same test: a
  progress update pushed through `/sync/push` with `baseRevision: null`
  (i.e., authored entirely offline) is confirmed `applied`; a retried
  push for the same `localId` (simulating a device that didn't see the
  first response) comes back `applied` again rather than erroring or
  duplicating; the record is then confirmed present via `/sync/pull`,
  visible in the planner's normal acceptance queue exactly like a web-
  submitted one, and accepted through the ordinary `/accept` endpoint —
  after which the task's `percentComplete` reflects the offline-submitted
  value. This is the server-side half of Addendum A6's stated Phase 11c
  gate ("full offline field-update round trip") proven against a real
  Postgres instance, not mocked.
- **`apps/mobile`**: `tsc --noEmit` and `eslint --max-warnings=0` both
  pass clean for every new/changed file (the three lookahead screens, the
  local repo, the sync-engine's four touchpoints, the outbox's entity
  type). **Not executed**: this sandbox has no iOS simulator, Android
  emulator, or physical device — the same standing limitation noted in
  every mobile phase since Phase 2's gate report. The API-side sync test
  above proves the actual wire contract the mobile sync engine talks to
  (push idempotency, project-membership checks on the pushed `taskId`,
  pull visibility, planner acceptance); the client-side half (SQLite
  writes, outbox draining, the local `reviewStatus` mirror on pull, the
  three screens' rendering and interaction) is verified by type-safety
  and code review only, not execution. Treat the three new mobile screens
  as code-complete-but-unrun until verified on a real device or
  simulator, exactly like every mobile screen since Phase 2.

## Phase 12 gate report

**Gate** (user-directed, not from the original addendum plan: "is there PDF
export for Change Orders/RFIs/Submittals? If not there should be one";
"a portal for formal correspondence with owner/consultant/subcontractor
with signature available for the sender"; "when exporting PDFs, the admin
or contractor should be able to insert a PNG of the company logo") —
**PASSED**, see Verification. Two design decisions were made with the user
before building, via AskUserQuestion: the signature is a **typed name +
timestamp** (matching Inspections' existing sign-off pattern), not a drawn
signature; the logo lives **per-company**, not per-project, so a GC's
branding is set once and reused across every project that company works
on.

**What was built:**
- **`packages/db`**: `companies` gained `logoDataBase64`/`logoMime` (a PNG
  stored inline as base64, not through the project-scoped `attachments`/S3
  pipeline — a company isn't tied to any one project, and `companies` has
  no RLS policy for the same reason); `correspondence` gained
  `senderSignatureName`, captured at the same moment `sentDate` already
  was (the draft→sent transition). A `companies_member_update` RLS policy
  was added (the table previously had SELECT/INSERT only — no UPDATE
  policy existed for it at all) so the logo write actually reaches the
  row, scoped to `user_companies` membership specifically (stricter than
  the SELECT policy's `is_company_visible`, which also admits anyone
  sharing a project with the company — a collaborator viewing a company's
  logo shouldn't be able to overwrite it).
- **`apps/api/src/lib/pdf-builder.ts`** (new): a `PdfBuilder` class
  extracted from Phase 5's `inspection-report.ts` (same drawLine/
  ensureSpace/pagination logic, now shared) plus a new `drawLetterhead()`
  that embeds a PNG logo via pdf-lib's `embedPng()` top-left with the
  company name beside it — falling back to a plain bold company-name line
  (or nothing) if there's no logo or it fails to embed, so a bad/missing
  logo never breaks report generation. `inspection-report.ts` was
  refactored onto this builder with no output change (verified by its
  existing test still passing unmodified).
- **Company logo endpoints**: `uploadCompanyLogo`/`getCompanyLogo` in
  `company.service.ts`, `POST /companies/:id/logo` + `GET /companies/:id/logo`.
  List/create/upload responses all strip the (~1.4MB max) base64 blob down
  to a `hasLogo` boolean — only the dedicated GET-logo endpoint returns
  actual bytes — so `GET /companies` stays small regardless of how many
  companies have branding.
- **Branded PDF exports for RFI, Submittal, Change Order**: each gets a
  `get*ReportData()` in its own service (mirroring Inspection's
  `getInspectionReportData` pattern — one place that resolves every
  foreign key into a human-readable name) plus a `generate*Pdf()` in
  `apps/api/src/lib/`, and a `GET /{rfis,submittals,change-orders}/:id/report`
  route. None of these three record types has a direct "author company"
  column, so branding resolves via `project_users.companyId` for whoever
  created the record (`resolveAuthorCompanyBranding()`, shared helper) —
  the same join lookahead.service.ts already uses for commitment
  company-matching. Change Order's PDF also resolves every name/company in
  its existing JSONB `approvalChain` (untouched by this phase, from Phase
  6) for the approval-chain section.
- **Correspondence signature + PDF**: `transitionCorrespondenceStatusSchema`
  now requires `senderSignatureName` exactly when `toStatus` is `"sent"`
  (a zod `.refine()`, mirroring the shape of other conditional-validation
  rules already in the codebase); the service stores it alongside
  `sentDate`. Correspondence's branding is simpler than the other three --
  `fromCompanyId` is already a direct column, no `project_users` join
  needed. `GET /correspondence/:id/report` renders the letter with a
  signature block (signed name + underline + sent date, or "Not yet sent/
  signed" in red — same visual pattern as Inspection's own sign-off
  block).
- **`apps/web`**: a new `/companies` settings page (reachable via a
  "Manage company logo" link on the projects list) listing every company
  the caller belongs to or shares a project with, each with a PNG file
  picker + live preview (fetched as a blob and rendered via
  `URL.createObjectURL`, since the logo endpoint requires an auth header
  a plain `<img src>` can't carry) and an upload button. "Export PDF"
  buttons (fetch-as-blob-then-`window.open`, the same pattern Phase 5's
  Inspection report button already used) were added to the RFI, Submittal,
  and Change Order detail pages, and to Correspondence's detail page —
  which also gained a signature-name input that gates the "Sign & send"
  button (disabled until a name is typed) in place of the old plain "sent"
  transition button.
- **A real cross-test-suite bug found and fixed while adding this phase's
  gate test**: `cpm-schedule.test.ts`'s cleanup routine predates
  `scheduleProgressUpdates`/`scheduleConstraints`/`lookaheadCommitments`
  (all added in Phase 11c) and never deleted them before deleting the
  `cpmScheduleTasks` rows they reference — invisible until this session's
  earlier manual screenshot work happened to leave a progress-update row
  on Amman Heights, which then made the *next* full-suite run fail on a
  foreign-key violation. Fixed by extending that cleanup to match
  `lookahead.test.ts`'s (Phase 11c) already-correct deletion order.
  Unrelated to Phase 12's own code, but found and fixed in the course of
  it, per the project's standing corrections practice.

**Scope decisions:**
- **Typed-name signature, not a drawn one** — the user's explicit choice
  (see Gate above). A canvas signature-pad would need capture UI, image
  storage, and mobile touch handling for a visual flourish with no
  functional difference in what it proves; the typed-name + timestamp
  pattern was already proven out by Inspections.
- **Per-company logo, not per-project** — the user's explicit choice. A
  GC running several jobs sets its branding once rather than re-uploading
  it per project.
- **Logo stored inline in Postgres as base64 text, not through the
  attachments/S3 pipeline.** `attachments.projectId` is `NOT NULL` and
  RLS-scoped by project membership; a company logo is deliberately
  project-independent, so reusing that table would fight its own access
  model. A ~1.4MB base64 cap keeps this proportionate to "a logo," not a
  general image-upload feature.
- **No PDF export for Punch Items, Meetings, T&M Tickets, Daily Logs, or
  other modules.** The user asked specifically about Change Orders, RFIs,
  and Submittals; extending the same `PdfBuilder` pattern to any other
  module is now a small, mechanical addition (one report-data function +
  one generator + one route) whenever it's actually needed, not
  spec'd out speculatively here.
- **No draft-state PDF watermarking** ("DRAFT" stamped across a
  not-yet-approved document) — every export renders the record's current
  status as plain text in the header instead. A reasonable follow-up, not
  built speculatively.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (190 tests total: 108 `packages/shared`, 59
  `apps/api` — one new test this phase, `branded-pdf.test.ts` — 22
  `apps/web`, 1 `packages/db`, 0 `apps/mobile`), including a full
  production `next build` of `apps/web` (`/companies` compiles at 2.14
  kB).
- **The Phase 12 API gate test** (`apps/api/src/routes/branded-pdf.test.ts`):
  uploads a real PNG to a company via `POST /companies/:id/logo`; confirms
  a user on a *different* company gets 403 attempting the same upload;
  confirms `GET /companies` never carries the base64 blob (`hasLogo` only)
  while `GET /companies/:id/logo` returns real `image/png` bytes; creates
  an RFI, a Submittal, and a Change Order (submitted and approved, so its
  `approvalChain` has a real entry to resolve names for) and asserts each
  `/report` endpoint returns `application/pdf` bytes starting with the
  `%PDF-` magic header and over 500 bytes; creates a Correspondence item
  and asserts sending it without `senderSignatureName` 400s, sending it
  with one succeeds and the name is stored and returned, and its `/report`
  endpoint likewise returns a real PDF. Verified idempotent by running the
  full suite twice consecutively (a `resetCompanyLogo()` helper clears the
  test company's logo columns in `beforeAll`, since companies aren't
  project-scoped and so have no per-project cleanup hook to piggyback on
  like every other gate test's fixtures do).
- **Manual, real-browser verification** (Playwright against the live dev
  API, not just automated assertions): the `/companies` page correctly
  shows "No logo uploaded yet." for every company without one and a live
  image preview for the one with one; attempting to upload to a company
  the logged-in user does **not** belong to shows the 403 as a visible
  error message in the UI (the same "security boundary demonstrated live"
  pattern Phase 11c's screenshot session hit by accident); the RFI detail
  page's "Export PDF" button opens a populated PDF in a new tab; the
  Correspondence detail page's "Sign & send" button is disabled until a
  name is typed, and after signing, the page correctly shows status
  "Sent" and "Signed by: Sara Haddad" in place of the signature form.

## Phase 13 gate report

**Gate** (user-directed follow-up to Phase 12: "There also should be an
export button to export all change orders/RFI's/submittals etc..., it
would export a table summary of all existing items[;] make export size as
A4 for all exports as a default") — **PASSED**, see Verification.

**What was built:**
- **A4 as the default page size for every PDF export, not just new ones.**
  `PdfBuilder`'s `PAGE_WIDTH`/`PAGE_HEIGHT` constants changed from US
  Letter (612×792pt) to A4 (595.28×841.89pt) — the one place every report
  generator (Inspection, RFI, Submittal, Change Order, Correspondence, and
  this phase's five new registers) gets its page size from, so the change
  applies uniformly with no per-generator edits. Safe only because of
  Phase 12's word-wrap fix to `drawLine()`: without it, A4's ~17pt-narrower
  usable width would have re-clipped the longest lines that just barely
  fit on Letter.
- **`PdfBuilder.drawTable()`** (new): a header row plus one row per item,
  each cell greedily word-wrapped to its own column width (the existing
  `wrapText()` private method, now parameterized by width instead of
  hardcoded to the full page). Repeats the header row on every page the
  table spans — exercised for real by the RFI register during manual
  verification (355 seeded RFIs across 10 pages, see Verification), not
  just a short synthetic table.
- **Five "export all" list-report data functions**, one per module with an
  existing single-item PDF export (`get*ListReportData()` in
  `rfi.service.ts`, `submittal.service.ts`, `change-management.service.ts`,
  `correspondence.service.ts`, `inspection.service.ts`), each resolving
  every foreign key on every row for the project in batched `inArray`
  queries (not N+1 per row) — the same "one place resolves every name"
  discipline as the single-item `get*ReportData()` functions. Branding for
  a register uses the **requesting user's own company** on the project
  (`resolveAuthorCompanyBranding()`, reused as-is by passing the caller's
  own `userId` instead of a record's creator) rather than any one row's
  author or from-company, since a register spans many of both. Inspection's
  register stays unbranded, matching its existing single-item report
  (Phase 5 predates Phase 12's letterhead; not retrofitted here as it's
  outside this phase's ask).
- **Five `generate*ListPdf()` generators** in `apps/api/src/lib/` and a
  `GET /{rfis,submittals,change-orders,correspondence,inspections}/summary-report?projectId=`
  route on each, registered **before** that router's `/:id` route where one
  exists (`rfis`, `submittals`, `change-orders`, `inspections`) so Express's
  first-match routing doesn't swallow the literal path as an `:id` value.
- **"Export All (PDF)" button** on all five list pages
  (`rfis`/`submittals`/`change-orders`/`correspondence`/`inspections`),
  using the same fetch-as-blob-then-`window.open` pattern every other
  export button already uses.
- **Change orders / RFIs / submittals / correspondence** were the modules
  the user named; **Inspections** was added for consistency (it already
  had a single-item PDF export from Phase 5) rather than leaving one
  module without the same "export all" the other four just got.
- **A real bug found and fixed via the gate test, not eyeballing**: the
  correspondence register's "From → To" column used a Unicode arrow, which
  pdf-lib's standard Helvetica (WinAnsi encoding) cannot encode —
  `generateCorrespondenceListPdf` threw and the route 500'd the instant a
  real row existed. The gate test caught this on its first run (an empty
  register never exercises the arrow, so a smaller/less deliberate test
  could have missed it). Fixed by using an ASCII `->` separator instead.

**Scope decisions:**
- **No column/sort/status filtering on the summary endpoints** — each
  register exports every item on the project, matching the "export all"
  the user asked for literally. A filtered export is a reasonable future
  add but wasn't requested.
- **No CSV/Excel export** — the user asked for "a table summary" as a PDF
  (this request followed directly from Phase 12's PDF-export work); a
  spreadsheet-format export is a different, unrequested feature.
- **Inspection's register left unbranded** rather than retrofitting Phase
  12's letterhead onto Phase 5's report generator — a real gap, but
  extending it was outside what this phase's request asked for.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test` all green in `apps/api` and
  `apps/web` (60 `apps/api` tests — one new file this phase,
  `summary-report.test.ts` — up from 59; full suite re-run twice
  consecutively to confirm idempotency).
- **The Phase 13 API gate test**
  (`apps/api/src/routes/summary-report.test.ts`): seeds one new item in
  each of the five modules, then asserts every `/summary-report` endpoint
  returns `application/pdf` bytes starting with the `%PDF-` magic header
  and over 500 bytes. This is what caught the "→" encoding bug above.
- **Manual, real-PDF verification** (not just status-code assertions —
  the actual rendered output was read): re-fetched all five registers
  against the live dev API and read each PDF's content directly. Confirmed
  the RFI register (355 rows, seeded across many earlier phases' test
  runs) paginates correctly across 10 pages with the header row correctly
  repeated on every page; the Change Order register's currency formatting
  ($3,000, $1,500, …) renders correctly; the Correspondence register's
  `->` fix renders cleanly with no crash; the company logo (a demo PNG,
  re-uploaded after an earlier test run's `resetCompanyLogo()` had cleared
  it) renders correctly in the letterhead on the branded registers; the
  unbranded Inspection register correctly omits the letterhead.

## Phase 14 gate report

**Gate** (user-directed follow-up: "Is there a built in pdf viewer inside?"
→ "Yes i need a pdf viewer inside the app/web page with navigation / zoom
inside the app") — **PASSED**, see Verification.

**What was built:**
- **`PdfViewerModal`** (new, `apps/web/components/PdfViewerModal.tsx`): a
  modal that renders a PDF's pages onto a `<canvas>` via pdf.js, with
  prev/next page navigation (repeating the header-row pattern from Phase
  13's registers means a 10-page document is just as navigable here),
  zoom in/out/reset (50%–300%, 25% steps), a Download button, and Escape/
  backdrop-click to close. Replaces every export button's previous
  fetch-blob-then-`window.open()` handoff to the browser's own PDF tab.
- **`usePdfViewer()`** (new, `apps/web/lib/use-pdf-viewer.ts`): the shared
  hook that fetches a report's bytes via `apiFetch` and drives the modal's
  open/loading/error state -- one hook reused by all 10 export buttons
  (5 single-item + 5 "export all" registers from Phase 13) instead of each
  page repeating its own fetch-blob-download logic.
- **`loadPdfjs()`** (new, `apps/web/lib/pdfjs.ts`): the single place that
  dynamically imports `pdfjs-dist`, wires its bundled worker script, and
  applies a `Map.prototype.getOrInsertComputed` polyfill (see bug below).
  `DrawingViewer.tsx` (Phase 3's single-sheet drawing viewer) was switched
  onto this same helper, both to deduplicate what were two copies of the
  same dynamic-import/worker-wiring code and because it carried the exact
  same latent bug.
- **A real, currently-live upstream bug found via manual browser
  testing, not any automated test**: pdfjs-dist 6.3.289's main-thread
  worker-messaging layer calls `Map.prototype.getOrInsertComputed` on
  every page render -- a very recent (stage-3) JS proposal not yet
  shipped in *any* current browser, confirmed absent even in the
  Playwright-bundled Chromium 141 used for this verification. Every
  `page.render()` call threw immediately. Two other pdfjs-dist versions
  were tried and rejected before landing on the actual fix: downgrading
  to 5.4.624 (the newest release still free of the `getOrInsertComputed`
  call) avoided that crash but hit a *different* one -- a webpack/ESM
  interop failure ("Object.defineProperty called on non-object") loading
  `pdf.mjs` under Next's bundler -- so the dependency stayed on 6.3.289
  and the real fix is the small polyfill in `loadPdfjs()` instead.

**Scope decisions:**
- **No keyboard shortcuts** (arrow-key page nav, +/- zoom) -- button
  controls satisfy "navigation and zoom" as asked; can be added cheaply
  later if wanted.
- **`DrawingViewer.tsx`'s own single-page markup UI was not converted to
  `PdfViewerModal`** -- it solves a different problem (pin/polygon markup
  placement keyed to normalized page coordinates, Phase 3), not report
  viewing. It was updated only to fix the same underlying pdf.js bug via
  the same new `loadPdfjs()` helper, not redesigned.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package.
- **Manual, real-browser verification** (Playwright against the live dev
  API and web server, not just automated assertions -- this is what
  caught the `getOrInsertComputed` bug in the first place): opened the
  single-item viewer on a real RFI and confirmed the canvas renders,
  zoomed from 125% to 150% and confirmed the displayed percentage and
  re-render, confirmed Close removes the canvas from the DOM; opened the
  10-page RFI register from Phase 13 and paged from 1 to 2, confirming
  both the page indicator and the rendered content changed; separately
  confirmed `DrawingViewer.tsx` still renders correctly post-fix (a
  seeded drawing with no actual uploaded file content correctly showed
  its own pre-existing "No revisions uploaded yet." empty state --
  unrelated to this phase, not a regression).

## Phase 11d gate report

**Gate** (docs/SCHEDULING.md A9: "CPM engine behind a feature flag,
in-app editing, drag-reschedule with impact preview, XML export. Gate:
the 25-scenario golden-file suite passes and the 2,000-task computation
stays under 500ms.") — **PASSED**, see Verification. Built on explicit
user confirmation to proceed with Tier B now, after Tier A (Phase
11a-11c) was already complete.

**What was built:**
- **`packages/shared`**: `schedule/calendar.ts` -- calendar-aware
  working-time date arithmetic (`workingTimeAdd`/`Subtract`/`Between`,
  snap-to-working-instant), UTC-only so results are host-timezone-
  independent, with 17 tests. `schedule/cpm.ts` -- the pure
  `computeSchedule()` engine: Kahn's-algorithm topological sort with
  cycle detection, forward/backward pass, 4 dependency types (FS/SS/FF/
  SF) with lag, 8 constraint types (asap/alap/snet/snlt/fnet/fnlt/mso/
  mfo), calendar-aware duration, progress/data-date handling with
  retained-logic vs progress-override semantics, `ignoreConstraintsOnCritical`,
  WBS/summary duration-weighted rollup -- 35 golden-file scenarios (the
  25-scenario gate, exceeded) plus a 2,000-task performance test,
  comfortably under the 500ms bar. `schedule/exporters/ms-project-xml.ts`
  -- the reverse of the existing importer, round-trip tested.
- **`packages/db`**: `schedules.nativeEditingEnabled` boolean, default
  `false` (migration 0019) -- the Tier B feature flag, off for every
  existing and newly-imported schedule until a project opts in.
- **`apps/api`**: `cpm-schedule-edit.service.ts` -- `setNativeEditingEnabled`
  (admin-gated, same level project_manager/owner_admin already hold on
  every other schedule action), `previewScheduleEdits` (runs
  `computeSchedule()` against a proposed batch of task edits/dependency
  adds/removes without persisting -- the "impact preview before commit"
  requirement), `applyScheduleEdits` (validates the batch would not
  create a dependency cycle *before* writing anything, then persists and
  recomputes the whole version -- any task's dates can shift, not just
  the one edited -- and also updates `plannedStart`/`plannedFinish`
  alongside `earlyStart`/`earlyFinish`, since once native editing is
  live the engine's own computed schedule *is* the current plan, not a
  frozen import snapshot), `recomputeVersion`, and `exportVersionXml`.
  New routes on the existing `/schedules` router: `PATCH
  /:scheduleId/native-editing`, `POST /versions/:id/preview`, `POST
  /versions/:id/apply`, `POST /versions/:id/recompute`, `GET
  /versions/:id/export.xml`.
- **`apps/web`**: the Gantt page's canvas `Timeline` gained real drag
  interactions -- drag a bar's body to reschedule (sets a `mso` "must
  start on" constraint), drag its right edge to resize (changes
  duration), drag from a link handle (shown on the selected row) to
  another row to add an FS dependency. Every drag ends by calling
  `preview`, then opens `ImpactPreviewModal` (a before/after table of
  every task whose finish date or critical-path status changed, or a
  clear rejection message if the change would create a cycle) before
  anything is committed via `apply`. A client-side undo stack (the
  *inverse* of each applied batch, captured before the edit) backs an
  Undo button. An "Enable/Disable editing" toggle and an "Export XML"
  button (triggers a browser download) were added to the toolbar.

**Bugs found and fixed via manual, real-browser testing (not just automated
assertions) before this phase could be called done:**
- **A schedule with zero calendar rows crashed the API with a bare 500**
  instead of a clean error. CSV is the one supported import format that
  creates no calendar row (`importers/csv.ts` never populates
  `parsed.calendars`); enabling native editing and dragging a bar on such
  a schedule threw `TypeError: Cannot read properties of undefined
  (reading 'exceptions')` inside `computeSchedule()`'s calendar lookup.
  Fixed with an explicit `no_calendar` `ApiError` (422) in
  `requireNativeEditingEnabled()`, with a regression test.
- **A dragged bar didn't visually move even after a successful apply.**
  The Gantt renders `plannedStart ?? earlyStart` (`taskDateRange()`), and
  the original `applyScheduleEdits` only wrote the recomputed dates onto
  `earlyStart`/`earlyFinish`, leaving the imported `plannedStart`/
  `plannedFinish` (which take display precedence) stale forever. Fixed
  by also writing `plannedStart`/`plannedFinish` on apply (see above) --
  confirmed visually via Playwright: a dragged "Foundation Work" bar
  moved from Feb 01-03 to Feb 05-08, correctly rippling a delay onto
  "Framing" and "Roofing" downstream, both before and after Undo.
- **`apps/api`'s vitest suite raced itself under the unfiltered `pnpm
  test`**: two integration-test files (`cpm-schedule.test.ts` and the new
  `cpm-schedule-edit.test.ts`) both mutate the *same* seeded project's
  singleton `schedules` row and were assigned to different parallel
  vitest workers, causing duplicate-version-number and foreign-key
  errors when run together (each file alone passed reliably). Fixed by
  setting `fileParallelism: false` in `apps/api/vitest.config.ts` --
  these are integration tests against one real, shared Postgres
  instance, not isolated unit tests, so serial file execution is the
  correct trade-off, not a workaround.

**Scope decisions:**
- **Dependency CRUD is folded into the same batch-edit endpoint as task
  edits** (`taskEdits`/`dependencyAdds`/`dependencyRemoveIds` in one
  `ScheduleEditBatchInput`), rather than separate CRUD routes -- a single
  preview/apply round trip naturally covers "drag to create a
  dependency" and "drag to reschedule" through the same impact-preview
  flow, and the golden-file engine already treats a batch as one
  computation.
- **A resize drag's minute delta is a rough calendar-day estimate**
  client-side (`ASSUMED_MINUTES_PER_DAY = 8 * 60`) -- the authoritative
  value is whatever the preview endpoint's real per-task calendar
  computes, shown in the impact preview before commit; this only drives
  the live ghost overlay during the drag itself.
- **No redo stack**, only undo -- redoing an undo is a straightforward
  follow-up if wanted, not required by the gate.
- **PDF/XLSX export and the `.mpp`/MPXJ sidecar remain out of scope**,
  per the Phase 11b gate report's original deferral and A1's constraint
  -- unchanged by this phase.
- Tier C (resources, levelling, earned value) was **not built**, per
  explicit standing instruction.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (`packages/shared`: 164 tests across 19 files,
  including the new 17-test `calendar.test.ts` and 35-test `cpm.test.ts`;
  `apps/api`: 62 tests across 17 files, including the new 2-test
  `cpm-schedule-edit.test.ts` covering the full flag → preview → apply →
  cycle-rejection → export flow and the calendar-less-schedule failure
  case; `apps/web`: 22 tests unaffected).
- **Manual, real-browser verification** (Playwright against the live dev
  API and web server): imported a 3-task P6 XER schedule, enabled native
  editing, dragged the first task's bar 4 days later at day-zoom,
  confirmed the impact-preview modal showed the correct before/after
  finish dates for all three tasks (the delay rippling through the FS
  chain) with no cycle warning, clicked Apply, confirmed the bars and
  grid dates visually updated, then clicked Undo and confirmed the
  schedule returned to its pre-drag state and the Undo button disabled
  itself. Separately confirmed via `curl` that a client_viewer is
  rejected (403) from toggling the flag and that a cycle-creating
  dependency add is rejected (409) without mutating anything.

## Phase 15 gate report

**Gate** (user-directed follow-up: a competitive-gap analysis against
Procore identified 10 candidate gaps; user selected items 1, 5, 6, 7, 8, 9,
10, 11, 12, 13 to build, sequenced into 7 dependency-ordered phases with a
gate after each. This is Phase 15, the first: "Enterprise/Admin
foundations" — custom fields + a scoped record-history viewer (the
audit-log-viewer half of item 11) + multi-currency depth (item 12,
descoped per user decision to "deepen en/ar only, no new language" — the
currency work is the tractable slice of that decision). SSO (the other
half of item 11) was explicitly descoped by the user to "skip for now.") —
**PASSED**, see Verification.

**What was built:**
- **`packages/db`**: new `custom_field_definitions` (project_id, module
  reusing the existing `permission_module` enum, label, field_type enum
  [text/number/date/boolean/select], options jsonb, required, sort_order)
  and `custom_field_values` (definition_id fk cascade-delete, entity_id
  polymorphic, value jsonb, unique on (definition_id, entity_id)) tables
  — migration 0038. RLS: `custom_field_definitions` added to the direct
  `project_id` policy loop; `custom_field_values` added to the
  child-via-parent loop. `projects` gained `default_currency` varchar(3)
  default `USD`.
- **`packages/shared`**: `formatMoney(value, currency, locale)` (new
  `business-rules/format-money.ts`, 7 tests) using `Intl.NumberFormat`'s
  `currency` style — the one place a monetary amount becomes display
  text, replacing 12 separate ad-hoc `money()` helpers across web pages
  that did plain `.toLocaleString()` with **no currency symbol at all**,
  silently discarding the `currency` column three financial tables
  (`budget_line_items`, `prime_contracts`, `commitments`) already stored
  from earlier phases. `schemas/custom-field.schema.ts` — zod schemas for
  definition CRUD + value set, plus `validateCustomFieldValue()` (shared
  between the API write path and any future client-side validation).
  `schemas/project.schema.ts` gained `updateProjectSettingsSchema`
  (defaultCurrency/changeOrderThreshold/timezone) — there was previously
  **no update path at all** for these fields past project creation.
- **`apps/api`**: `custom-field.service.ts` + `routes/custom-fields.routes.ts`
  — definition CRUD (`directory:admin` gated, same convention as
  permission templates) at `/custom-field-definitions`, value get/set at
  `/custom-field-values` (`standard` on the definition's module gates a
  write — whoever can edit the record can edit its custom fields).
  `entity-history.service.ts` (new) — `getEntityHistory()` backing `GET
  /projects/:id/history?entityType=&entityId=`: `audit_log` has no
  `project_id` (it's polymorphic, RLS is intentionally permissive there
  per the existing comment in `001_rls_and_functions.sql`), so real
  authorization comes from reading the entity through its own
  RLS-protected table first — a 0-row result (wrong project, or RLS hides
  it) is a 404 before `audit_log` is ever touched, the same
  "resolve-via-the-owning-table" pattern `search.service.ts` already uses
  for polymorphic project-scoping. Wired for `rfi` and `punch_item`
  (`HISTORY_ENTITY_TYPES` is a plain array — extend it per module as
  each one gets a History panel). `project.service.ts` gained
  `updateProjectSettings()` behind a new `PATCH /projects/:id/settings`
  route, and `projects.routes.ts` gained a plain `GET /projects/:id` (it
  genuinely didn't exist — every other project read was a sub-resource
  under `/projects/:id/...`).
- **`apps/web`**: new `/projects/:id/settings` page (General: currency/
  threshold/timezone form; Custom Fields: per-module definition list +
  add-field form) linked from the People nav group. New
  `RecordHistory` component (`components/ui/RecordHistory.tsx`) — an
  expandable "History" toggle, wired into the RFI and Punch Item detail
  pages. `lib/use-project-currency.ts` — a small hook fetching a
  project's `defaultCurrency` once, defaulting to "USD" until it loads,
  used by the 6 financial pages with no per-row currency (Direct Costs,
  Prequalification, Bidding detail, Estimating detail, Billing detail,
  Change Orders); the 3 pages with per-row currency (Budget, Prime
  Contract, Commitments detail) format using the record's own `currency`
  field instead. `company-dashboard.service.ts`'s per-project rollup rows
  gained `defaultCurrency` so the company-level dashboard renders each
  project's own currency rather than a company-wide guess — it already
  didn't sum figures numerically across projects (a list of per-project
  dashboards, not an aggregate), so no fabricated FX conversion was ever
  at risk here.
- **Explicitly not built, on record**: SSO/SAML (user: "skip for now" —
  revisit when a real enterprise customer needs it, since it can't
  actually be verified without a live IdP). A project-wide "Activity Log"
  browsing page was considered and rejected: building it safely would
  mean either denormalizing `project_id` onto `audit_log` and touching
  the ~100 existing `writeAuditLog` call sites, or an unscoped/insecure
  query — both out of proportion to this phase. The scoped
  per-record History panel (built) covers the actually-useful case
  ("what happened to this RFI") without either cost.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (`packages/shared`: 178 tests across 21 files,
  including the new 7-test `format-money.test.ts`; `apps/api`: 134 tests
  across 28 files, including the new 8-test
  `custom-fields-history.test.ts` covering definition CRUD, the
  directory:admin gate, select-option validation, cascade delete on
  definition removal, scoped history's create-audit-entry return and its
  wrong-project 404, and project-settings update + its admin gate;
  `apps/web`: 28 tests unaffected; i18n key parity confirmed
  identical between `en.json`/`ar.json` via a flatten-and-diff script).
  Full `next build` also confirmed the new `/settings` route compiles
  and prerenders correctly.

## Phase 16 gate report

**Gate** (Phase 2 of the same 7-phase, user-directed follow-up as Phase 15
— gap items #5 "Notifications" and #6 "Workflow configurability") —
**PASSED**, see Verification.

**What was built:**
- **`packages/db`**: the `notifications` table already existed
  (user_id, type, payload jsonb, read_at, created_at) but was unused —
  its RLS policy was `FOR ALL` scoped to `user_id = current user`, which
  would have blocked every insert, since a notification's `user_id` is
  its *recipient*, almost always someone other than the actor whose
  action creates it. Split into three policies: `notifications_insert`
  (any authenticated session — the API picks the recipient), and
  `notifications_select`/`notifications_update` scoped to the recipient;
  no DELETE policy, deletes refused outright, same as `audit_log`. New
  `workflow_transition_rules` table (project_id, module reusing
  `permission_module`, from_status/to_status varchar since status
  vocabularies vary per module, enabled boolean default true,
  required_level reusing `permission_level` default "standard", unique on
  (project_id, module, from_status, to_status)) — migration 0039, added
  to the direct `project_id` RLS loop.
- **`packages/shared`**: `schemas/notification.schema.ts` —
  `NOTIFICATION_TYPES` (rfi_assigned/rfi_answered/rfi_overdue/
  submittal_assigned/submittal_status_changed/punch_item_assigned/
  punch_item_status_changed/change_order_status_changed),
  `notificationPayloadSchema` (projectId/entityType/entityId/summary,
  passthrough), `listNotificationsQuerySchema`.
  `schemas/workflow-rule.schema.ts` — `upsertWorkflowTransitionRuleSchema`/
  `listWorkflowTransitionRulesQuerySchema`/`deleteWorkflowTransitionRuleSchema`.
- **`apps/api`**: `notification.service.ts` — `notifyUser`/`notifyUsers`
  (insert, skipping the actor and duplicate recipients — called from
  inside the caller's own `withRequestContext` transaction, valid under
  the new insert policy) plus `listNotifications`/
  `countUnreadNotifications`/`markNotificationRead`/
  `markAllNotificationsRead`, routed at `/notifications`. Wired into
  `rfi.service.ts` (create → assignee + distribution list;
  ball-in-court reassignment via update; an official response →
  notifies the original asker), `submittal.service.ts` (create →
  ball-in-court + distribution; reassignment; each review event →
  either the next reviewer or, once all reviews are in, the creator),
  `punch-item.service.ts` (create → assignee + final approver +
  distribution; reassignment; every status transition → assignee, final
  approver, and creator), and `change-management.service.ts` (a change
  order's approve/reject/execute → its creator). The RFI overdue-sweep
  job (`jobs/rfi-overdue-sweep.ts`, a system sweep with no per-user
  request context) now also inserts an `rfi_overdue` notification
  directly via `authDb` alongside its existing escalation email.
  `workflow-rule.service.ts` — CRUD at `/workflow-transition-rules`
  (`directory:admin` gated, same convention as custom fields and
  permission templates) plus `enforceWorkflowTransitionRule()`, called
  from inside `rfi.service.ts`'s and `punch-item.service.ts`'s own
  `transitionXStatus` after their hardcoded transition table has already
  accepted the move. A rule can only make an already-legal transition
  *stricter* — disable it outright (`transition_disabled`, 403), or
  raise the permission level required for it above the module's own base
  check (`PermissionDeniedError`) — never widen the state machine: an
  admin creating a rule for a `(module, fromStatus, toStatus)` tuple the
  module's own transition table doesn't contain gets a 400
  (`unsupported_transition`), and rules are only accepted for the two
  pilot modules (`rfis`, `punch_list`) rather than all 24, since
  validating a tuple requires that module's own transition table and
  wiring enforcement into every module's own service was out of
  proportion to this phase. A `(module, fromStatus, toStatus)` with no
  saved rule behaves exactly as the module's hardcoded default
  (enabled, no elevated level) — this table starts empty and only ever
  holds explicit admin overrides.
- **`apps/web`**: `components/shell/NotificationBell.tsx` — a bell icon
  in `Header.tsx` (next to `UserMenu`, same dropdown/focus-management
  pattern), unread-count badge polled every 30s (no websocket/push
  infra exists), a panel listing notifications that marks one read and
  navigates to its entity on click, and a "mark all read" action.
  `components/WorkflowRulesSection.tsx` — a new section on the existing
  Settings page (`projects/[id]/settings`) letting a `directory:admin`
  narrow the RFI/Punch List modules' transitions: every transition the
  module's hardcoded table allows is always listed (not just ones an
  admin has touched), each with an enabled checkbox and a required-level
  select that upserts on change.
- **`docs`**: this gate report; `DATA_MODEL.md` updated for
  `notifications` (now in active use) and `workflow_transition_rules`.

**Explicitly not built, on record:**
- **Mobile push / websocket delivery**: the notification bell polls;
  there's no push channel or live socket in this stack (per
  Assumption 8, mobile push was already out of scope for v1). A 30s lag
  on the unread badge was accepted as proportionate rather than adding
  that infrastructure for this phase.
- **Workflow rules beyond the two pilot modules**: narrowing-only
  enforcement is wired for `rfis` and `punch_list` only. Widening to
  every module needing its own `enforceWorkflowTransitionRule()` call
  and its own hardcoded transition table read is straightforward
  per-module follow-up, not a design gap — deferred to keep this phase's
  blast radius bounded to two well-understood state machines.
- **A generic "workflow builder"** (arbitrary custom statuses, branching
  approval chains): out of scope per the user's own framing of gap #6 as
  "workflow *configurability*", not a full BPM engine — Procore itself
  only exposes narrowing/require-approval controls on its built-in
  workflows, not arbitrary new ones.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (`packages/shared`: 178 tests across 21 files,
  unaffected; `apps/api`: 143 tests across 30 files, including the new
  3-test `notifications.test.ts` — an RFI's ball-in-court user gets
  notified on assignment while the creator/actor does not, a user
  cannot mark another user's notification read (RLS), and read-all
  clears every unread notification for the caller — and the new 6-test
  `workflow-rules.test.ts` — non-admin rejected, an unsupported
  transition rejected (`closed→open` isn't in `RFI_STATUS_TRANSITIONS`),
  an unsupported module rejected (`submittals`), disabling
  `open→closed` blocks even an admin caller and is restored afterward,
  raising a punch item transition's required level to `admin` blocks a
  `standard`-level foreman but not an admin caller, and rules list
  scoped by module; `apps/web`: 28 tests unaffected; i18n key parity
  confirmed identical between `en.json`/`ar.json`, `Notifications` and
  `WorkflowRules` namespaces added to both). Full `next build` also
  confirmed the `/settings` route (now with the workflow-rules section)
  still compiles and prerenders correctly.

## Phase 17 gate report

**Gate** (Phase 3 of the same 7-phase, user-directed follow-up as Phases
15-16 — gap item #7 "Analytics/BI") — **PASSED**, see Verification.

**What was built:**
- **The `reports` permission module's first real use.** It was defined
  in `packages/shared`'s permission engine and seeded into every role's
  default template from Phase 1 onward, but nothing ever checked it —
  granting or revoking "Reports" access changed nothing observable. The
  new analytics endpoint requires `reports:read`, closing that gap;
  every other module's own read permission still separately gates its
  own section within the response (see below), so a `reports:read`
  caller only sees the sections their other permissions already allow.
- **`packages/shared`**: `business-rules/trends.ts` (new, 10 tests) —
  `bucketByWeek`/`bucketSumByMonth` (fixed-width time buckets, oldest
  first, every bucket present even at zero so a quiet week/month isn't
  silently dropped from a chart) and `averageDurationDays` (null for an
  empty set, not `NaN` — "no data yet" and "zero days" are different
  facts). Pure functions, no I/O, following the same convention as
  `schedule/calendar.ts`.
- **`apps/api`**: `analytics.service.ts` — `getProjectAnalytics()`
  mirrors `dashboard.service.ts`'s per-section permission-gated
  aggregation, but adds real trend/cycle-time math instead of a
  snapshot count: RFIs (created-vs-officially-answered weekly, average
  response time from the official response's `createdAt` minus the
  RFI's own), Punch List (created-vs-closed weekly using
  `punch_item_history` rows where `to_status = 'closed'`, average cycle
  time), Submittals (created-vs-resolved weekly, where "resolved" means
  reaching any status besides draft/in_review, using `updatedAt` as the
  resolution timestamp), Safety (incidents-per-week from `occurred_at`,
  by-severity, average time-to-close from `occurred_at` to `closed_at`),
  Change Orders (approved cost impact summed by month, using the
  `approval_chain`'s last entry's timestamp, by-status). Every number
  comes from a timestamp the app already stored for some other reason —
  no periodic snapshot job was added, so there is deliberately no trend
  data before a record's own creation date. Routed at `GET
  /projects/:id/analytics` in `projects.routes.ts`, next to the
  existing dashboard route.
- **`apps/api`**: CSV register-export twins of the five existing PDF
  "export all" registers from Phase 13 (RFI/Submittal/Change
  Order/Correspondence/Inspection) — `export.service.ts` gained
  `toRfiRegisterCsv`/`toSubmittalRegisterCsv`/`toChangeOrderRegisterCsv`/
  `toCorrespondenceRegisterCsv`/`toInspectionRegisterCsv`, reusing the
  same `getXListReportData()` each PDF generator already calls, so the
  two formats can never drift on what rows they include. Each module's
  existing `GET /summary-report` route now branches on `?format=csv` —
  no new route, no new permission gate (same `read`-level check the PDF
  already used, since it's the same data a list page already shows a
  `read`-level caller).
- **`apps/web`**: new `projects/[id]/analytics` page (nav link added
  next to Dashboard), gated on `reports:read` with the same
  forbidden-state pattern as the Settings page. Three small hand-rolled
  inline-SVG chart components (`components/charts/TrendBarChart.tsx`,
  `MonthlyBarChart.tsx`, `StatusBreakdown.tsx`) — no charting library
  dependency, following the Gantt module's own precedent (Phase 11b) of
  hand-rolling visualization rather than adding one for a handful of
  chart types. `lib/api-client.ts` gained `downloadFile()` (fetch
  through the authenticated client, save via a synthetic anchor click)
  — the CSV-download equivalent of the existing `usePdfViewer` hook's
  fetch-then-render, wired into a new "Export All (CSV)" button next to
  each of the five existing "Export All (PDF)" buttons.

**Explicitly not built, on record:**
- **Company-level (cross-project) analytics.** `company-dashboard.
  service.ts`'s existing per-project rollup list was left as-is; a
  portfolio-wide trend view is a reasonable next step but was out of
  scope here to keep this phase to the per-project case, matching how
  Phase 15's custom fields and Phase 16's workflow rules were also
  scoped to specific tables/modules rather than every surface at once.
- **A custom report builder** (arbitrary metric/dimension selection).
  Out of scope per the user's own framing of gap #7 as "Analytics/BI
  foundations" — five fixed, real trend views plus raw-data CSV export
  covers the two things a small GC's "BI" actually means in practice
  (a few key charts, and a spreadsheet to build their own charts from),
  not an ad-hoc query builder.
- **A periodic metrics-snapshot job.** Every trend above is derived
  from timestamps already stored for another reason (creation dates,
  status-history rows, `occurred_at`/`closed_at`). No cron/snapshot
  infrastructure was added to pre-aggregate history, consistent with
  this codebase's standing note (Phase 4's gate report) that there is
  no in-process scheduler this sandbox can verify.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (`packages/shared`: 188 tests across 22 files,
  including the new 10-test `trends.test.ts`; `apps/api`: 147 tests
  across 31 files, including the new 3-test `analytics.test.ts` — a
  caller with no `reports` permission is rejected, a caller with
  `reports:read` and read-or-above on every module gets every section
  populated with real trend/status data from freshly-seeded records,
  and a caller whose own module permission excludes one section (`qa_qc`:
  `change_management:none`) gets that section omitted while others
  still appear — and 2 new cases added to `summary-report.test.ts`
  confirming `?format=csv` returns `text/csv` with the expected header
  row and the same rows as the PDF version; `apps/web`: 28 tests
  unaffected; i18n key parity confirmed identical between `en.json`/
  `ar.json`, `Analytics` namespace and `ProjectNav.analytics`/
  `Common.exportAllCsv` keys added to both). Full `next build` also
  confirmed the new `/analytics` route compiles and prerenders
  correctly.

## Phase 18 gate report

**Gate** (Phase 4 of the same 7-phase, user-directed follow-up as Phases
15-17 — gap item #8 "Action Plans") — **PASSED**, see Verification.

**What was built:**
- **`packages/db`**: three new tables, deliberately a thin layer on top
  of the existing `corrective_actions` table rather than a parallel
  item-tracking system. `action_plan_templates` (project_id, name,
  description) and `action_plan_template_items` (template_id fk cascade,
  description, `default_due_days` — a UI hint only, never enforced
  server-side — sort_order) hold the reusable, admin-authored template.
  `action_plans` (project_id, template_id fk set-null, name, source_type
  reusing the existing `corrective_action_source_type` enum, source_id)
  is one instantiation of a template (or an ad-hoc plan with no
  template) against a source record. `corrective_actions` gained a
  nullable `action_plan_id` fk (set null on delete) — instantiating a
  plan bulk-creates one ordinary `corrective_actions` row per item,
  each stamped with the new plan's id, so every existing corrective-
  action list/transition/permission code path keeps working completely
  unchanged. An Action Plan has no `status` column of its own: it's
  derived at read time from its linked corrective actions' own statuses
  (`completed` only once every linked row reaches `completed`/`verified`,
  otherwise `in_progress`), so the two can never drift the way a
  separately-stored status would. RLS: templates/plans in the direct
  `project_id` loop, template items in the child-via-parent loop.
- **`packages/shared`**: `schemas/action-plan.schema.ts` — template
  CRUD schemas, and `instantiateActionPlanSchema`, which takes the
  final, concrete item list directly (description/assignedToUserId/
  dueDate per item — the same required fields `createCorrectiveActionSchema`
  already has for a single one-off action) rather than re-deriving
  defaults server-side; the web client resolves a template's items into
  pre-filled suggestions, but the server only ever accepts the caller's
  confirmed values.
- **`apps/api`**: `action-plan-template.service.ts` — template/item CRUD
  gated `directory:admin` for writes (same "an admin manages structure
  from one place" convention as custom field definitions and workflow
  transition rules) but `safety:read` for listing, since any project
  member who can already see corrective actions needs to be able to
  pick a template when applying one. Routed at `/action-plan-templates`.
  `action-plan.service.ts` — `instantiateActionPlan()` (gated
  `safety:standard`, the same level `createCorrectiveAction` already
  uses) inserts the plan row and every item's corrective-action row in
  one transaction; `listActionPlans()` (`safety:read`) joins in each
  plan's linked corrective actions to compute the derived status/
  item-count/completed-count in application code, mirroring how
  `dashboard.service.ts` already aggregates in JS rather than SQL for
  small per-project result sets. Routed at `/action-plans`.
- **`apps/web`**: `ActionPlanTemplatesSection.tsx` — a new section on
  the project Settings page (alongside Custom Fields and Workflow
  Rules) where a `directory:admin` defines templates and their ordered
  items. `CorrectiveActionsPanel.tsx` (already shared across the Safety
  Incident detail and Safety Observations list pages) gained an "Apply
  action plan" flow: pick a template, confirm a plan name, then fill in
  an assignee and due date per item (each pre-filled from
  `defaultDueDays` where the template item set one) and submit --
  instantiation refreshes the same corrective-actions list the panel
  already renders, so the new items simply appear as ordinary,
  independently-transitionable corrective actions, each carrying a
  small "from action plan" badge.

**Explicitly not built, on record:**
- **Company-level (cross-project) action plan templates.** Templates
  are project-scoped only, matching how Phase 15's custom fields and
  Phase 16's workflow rules were also scoped per-project rather than
  company-wide, to keep this phase's blast radius bounded.
- **Automatic triggering** (e.g. "always apply this template when a
  `critical`-severity incident is logged"). Every instantiation is an
  explicit action from the Corrective Actions panel; there is no rule
  engine deciding to apply a plan on the caller's behalf, which would
  be a materially larger and riskier feature (silently creating
  due-dated, assigned work items without a human choosing to).
- **Inspection-sourced Action Plans.** `correctiveActionSourceTypeEnum`
  already includes `inspection`, and the schema/service layer accepts
  it, but `CorrectiveActionsPanel` (and therefore the new "Apply
  action plan" entry point) is only actually rendered on the Safety
  Incident and Safety Observation pages today -- the same gap Phase 9's
  own corrective-actions work already had, not something this phase
  introduced or was asked to close.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (`packages/shared`: 188 tests across 22 files,
  unaffected; `apps/api`: 151 tests across 32 files, including the new
  4-test `action-plans.test.ts` — a non-admin is rejected from creating
  a template, an admin creates a template with two ordered items and
  fetches its detail, instantiating a plan creates linked corrective
  actions whose derived plan status starts `in_progress` and flips to
  `completed` only once *both* linked actions reach `completed`, and a
  non-`safety:standard` caller is rejected from instantiating; a
  pre-existing, unrelated test-fragility bug was also fixed in
  `submittal.test.ts`, whose number-format assertion assumed exactly 3
  digits when `formatSubmittalNumber`'s zero-padding is actually a
  *minimum* of 3 -- this project's spec-section sequence had run past
  999 after many session test runs, so the regex was widened from
  `\d{3}$` to `\d{3,}$` to match the real invariant; `apps/web`: 28
  tests unaffected; i18n key parity confirmed identical between
  `en.json`/`ar.json`, `ActionPlans` namespace and 4 new
  `CorrectiveActions` keys added to both). Full `next build` also
  confirmed the `/settings` route (now with the Action Plan Templates
  section) still compiles and prerenders correctly.

## Phase 19 gate report

**Gate** (Phase 5 of the same 7-phase, user-directed follow-up as Phase
15: "Email-to-project logging," gap item #9) -- **PASSED**, see
Verification.

**What was built:**
- **`packages/db`**: `projects` gained `inbound_email_token` (uuid, unique,
  `defaultRandom()` -- same generation mechanism as every id column) --
  migration 0041. The unique index lets a single `WHERE` clause resolve a
  webhook's "to" address straight to its project.
- **`packages/shared`**: `business-rules/inbound-email.ts` --
  `parseEmailAddresses`/`extractInboundToken`/`extractSenderAddress`, pure
  functions parsing raw "To"/"From" header text (comma-separated, optional
  `Display Name <addr>` wrapping) the way a real inbound-email provider's
  webhook hands it over (12 tests). `schemas/inbound-email.schema.ts` --
  `inboundEmailWebhookSchema`, the provider-agnostic payload contract this
  app's webhook accepts (`to`/`from`/`subject`/`text`/`attachments[]`,
  capped at 5 attachments / ~10MB decoded each).
- **`apps/api`**: `inbound-email.service.ts` -- `logInboundEmail()`,
  called from a new `POST /internal/inbound-email` route (shared-secret
  gated via `x-inbound-email-secret`/`INBOUND_EMAIL_WEBHOOK_SECRET`,
  alongside the existing cron routes in `internal.routes.ts`). Resolves
  the token to a project and the sender's email to a `users` row via
  `authDb` (bypassing RLS -- a fourth "genuinely pre-authentication"
  lookup alongside login-by-email/invite-token/refresh-token, since this
  webhook has no session), then requires that person be an actual member
  of that project with `correspondence:standard` before writing anything
  -- exactly the gate manual correspondence creation already uses, so
  email is not a side door around it. On success it inserts one ordinary
  "incoming" `correspondence` row (`fromCompanyId` = the sender's own
  project company, `toCompanyId` = the project's `gc`-type company) plus
  an `attachments` row per attachment, all under the sender's own RLS
  context via `appDb`, and audit-logs both. `GET /projects/:id` now also
  returns a computed `inboundEmailAddress` (`<token>@INBOUND_EMAIL_DOMAIN`)
  alongside the raw project row.
- **`apps/web`**: the project Settings page's General section now shows
  the project's inbound-email address with a one-click copy button, so a
  project member knows what to CC or forward mail to.
- **Explicitly not built, on record**: a real inbound-email provider
  account (SendGrid Inbound Parse / Mailgun Routes / SES receipt rules) --
  `INBOUND_EMAIL_DOMAIN` is a placeholder domain and wiring an actual
  provider's webhook (which posts in its own native format) to translate
  into this app's generic `inboundEmailWebhookSchema` payload is a
  deployment-time config step, not application code, since this project
  has no production inbound-email account. Logging mail from a sender who
  isn't a registered project member was also considered and rejected: the
  correspondence schema has no "external sender name/email" field at all
  (incoming correspondence has always been logged by a project user who
  received it, not authored by the external party), so accepting
  unregistered senders would need a schema change out of proportion to
  this phase; a stranger's mail addressed to the alias is acknowledged
  but not logged (`{matched:false, reason:"unknown_sender"}`). No
  reply-by-email or thread mapping -- every inbound message becomes one
  new Correspondence row.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (`packages/shared`: 200 tests across 24 files,
  including the new 12-test `inbound-email.test.ts`; `apps/api`: 157
  tests across 33 files, including the new 6-test
  `inbound-email.test.ts` -- wrong shared secret rejected, an
  unrecognized "to" token, an unregistered sender, a real registered
  user who isn't a member of *this* project (seed.ts's
  mahmoud.tarawneh, a member only of the infra project), a full happy
  path with a display-name-wrapped From header verified end-to-end
  through `GET /correspondence`, and an empty subject defaulting to
  "(no subject)"; `apps/web`: 28 tests unaffected; i18n key parity
  confirmed identical between `en.json`/`ar.json`, new `Common.copy`/
  `Common.copied` and `ProjectSettings.inboundEmailHeading`/
  `inboundEmailIntro` keys added to both). Full `next build` also
  confirmed the `/settings` route still compiles and prerenders
  correctly with the new inbound-email display.

## Phase 20 gate report

**Gate** (Phase 6 of the same 7-phase, user-directed follow-up as Phase
15 -- items #1, #10, #13 of the original 10-candidate gap list were never
recorded verbatim anywhere in this repo, only items #5-#9/#11/#12 got
named in earlier gate reports, so with the user unavailable to re-supply
them, this phase instead closes Assumption #8 on record since Phase 1:
"mobile push notifications," a genuine Procore-parity gap and a direct
extension of Phase 16's already-built notification pipeline) -- **PASSED**,
see Verification.

**What was built:**
- **`packages/db`**: new `push_tokens` table (`user_id`, `token` unique,
  `platform` enum `ios`/`android`, `created_at`) -- migration 0042. RLS:
  a single `push_tokens_all` policy trusting the API layer (any
  authenticated session may read/insert/update/delete, `WITH CHECK` pins
  only the *written* row's `user_id` to the caller) rather than a strict
  self-only policy, since two legitimate operations need to cross the
  ownership boundary in one statement -- dispatching a push (the actor
  reads the recipient's tokens) and a device changing hands (the same
  Expo token gets re-registered under a different logged-in user). Full
  reasoning is in the policy's own comment in
  `001_rls_and_functions.sql`; discovered mid-build when a naive
  self-only policy (mirroring `refresh_tokens_self`) correctly rejected
  the reassignment case in a test, which is what surfaced the design gap
  before it shipped.
- **`packages/shared`**: `schemas/push-token.schema.ts` --
  `registerPushTokenSchema`/`unregisterPushTokenSchema`.
- **`apps/api`**: `lib/push.ts` -- `sendExpoPushMessages()`, a
  fire-and-forget POST to Expo's push API (`https://exp.host/--/api/v2/push/send`)
  with a 5s timeout, no new dependency (Node 20+'s global `fetch`).
  `push-token.service.ts` -- register (upsert on the token's own
  uniqueness) / unregister. `POST /push-tokens` and `DELETE /push-tokens`,
  both `requireAuth`-gated, no per-project permission (a device isn't
  project-scoped). `notification.service.ts`'s `notifyUser()` --
  the single choke point every existing notification call site
  (RFI/Submittal/Punch Item/Change Order, 13 call sites across 4
  service files) already goes through, unchanged -- now also reads the
  recipient's registered tokens and fires the push, never awaited and
  every failure swallowed, exactly mirroring `auth.service.ts`'s
  existing `sendInviteEmail(...).catch(...)` precedent for invite
  emails. Since no seeded test user has a push token registered, none of
  the pre-existing 157 API tests changed behavior or slowed down.
- **`apps/mobile`**: added `expo-notifications` (`~0.29.14`, the SDK
  52-bundled version -- flagged per CLAUDE.md rule 10, though it's a
  first-party Expo package extending the already-locked stack, not an
  outside-the-stack swap) and the `expo-notifications` config plugin.
  `lib/push-notifications.ts` -- `registerForPushNotifications()`
  (permission request + token fetch + register, called whenever
  `AuthProvider`'s `auth` becomes non-null, covering both a fresh login
  and a restored session on relaunch) and
  `unregisterForPushNotifications()` (called from `logout()` while the
  session is still valid to authenticate the call). `app/_layout.tsx`'s
  new `NotificationTapHandler` deep-links a tapped notification straight
  to its RFI/Submittal/Punch Item/Change Order screen via `entityPath()`,
  a byte-for-byte port of `NotificationBell.entityPath` on web (same
  payload shape, same four modules with a detail screen today). Every
  step is wrapped in try/catch with the failure swallowed and logged --
  a denied permission, an emulator with no push credentials, or (the
  common case in this sandbox) no EAS project configured must never
  block using the rest of the app.
- **Explicitly not built, on record**: a real EAS project id (so
  `getExpoPushTokenAsync()` will typically no-op in this dev sandbox --
  wiring one is a deployment-time step); notification categories/actions
  (an inline "Mark read" from the OS tray); OS app-icon badge count sync
  with the in-app unread count (`shouldSetBadge: false` is deliberate).

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
  across every package (`packages/db`: unaffected, RLS policy verified
  manually via `psql \d push_tokens` showing both new policies applied;
  `apps/api`: 162 tests across 34 files, including the new 5-test
  `push-tokens.test.ts` -- rejects registration without a session,
  registers a token, re-registering the same token under a different
  user reassigns it (the case that caught the RLS design gap above),
  unregistering another user's token is a no-op rather than an error,
  and a notification to a recipient with a registered (deliberately
  fake) token doesn't fail the underlying RFI-creation write it
  accompanies; every pre-existing notification-triggering test file
  re-verified unaffected; `apps/web`: 28 tests unaffected, no web
  changes this phase; `apps/mobile`: `tsc`/`eslint` both clean, no test
  files exist for mobile in this repo, consistent with every earlier
  phase). Full `next build` also confirmed unaffected (no web routes
  touched).

## Phase 21 gate report

**Gate** (first slice of the user-directed "Enterprise UX, Data Architecture
& PDF System Upgrade" initiative -- a 42-section spec covering server-driven
data tables, saved views, global search, navigation, a centralized status
system, and a PDF architecture overhaul, to be delivered incrementally
rather than as one rebuild; the user authorized starting with a single
word, "Proceed," after this phase's audit and sequencing were proposed) --
**PASSED**, see Verification. This phase covers the audit plus the first
two of the spec's ten implementation phases (shared data infrastructure +
DataTable server mode), proven end-to-end on one module (RFIs) before
rolling out further.

**Audit finding that shaped this phase**: every existing list endpoint ran
an unfiltered, unpaginated `SELECT * WHERE project_id = ?`, with all
search/filter/sort happening client-side via `useMemo` after fetching every
row. This works at today's seed scale but doesn't scale to a real project's
record volume, and is the reason the spec asks for a server query contract
before any further DataTable/UX work. Separately, CLAUDE.md's stack table
names TanStack Query + Zustand for web state management, but neither is
actually installed or used anywhere in `apps/web` -- every page uses plain
`useState`/`useEffect`. That gap is flagged here rather than silently
carried forward.

**What was built:**
- **`packages/shared`**: `schemas/list-query.schema.ts` -- a generic
  `paginationQuerySchema` (`search`/`sort`/`direction`/`page`/`pageSize`,
  all optional, `MAX_PAGE_SIZE=200`), `DEFAULT_PAGE_SIZE=50`, and a
  `PaginatedResult<T> = { rows: T[]; total: number }` type -- the reusable
  contract every future module migration extends. `schemas/rfi.schema.ts`
  gained `listRfisQuerySchema` (extends the generic schema with a narrowed
  `sort` enum and RFI-specific `status`/`assigneeUserId` filters), `.strict()`.
- **`apps/api`**: `rfi.service.ts`'s `listRfis` now accepts an optional
  query object and returns `PaginatedResult<RfiWithOverdue>`. Search/status/
  assignee filters and sort became SQL `WHERE`/`ORDER BY` clauses;
  pagination (`LIMIT`/`OFFSET` plus a parallel `count()` query) only
  activates when the caller sends `page`/`pageSize` explicitly, so every
  caller that doesn't (mobile, any not-yet-migrated code) gets the exact
  same "return everything" response it always did. The private-RFI
  visibility rule (`canViewPrivateRfi`) was re-expressed as a SQL
  `OR`/`EXISTS` predicate rather than a post-fetch JS filter -- required
  once `LIMIT`/`OFFSET` entered the picture, since filtering after the
  database page would produce wrong `total` counts and short pages.
  `rfis.routes.ts`'s `GET /` responds with the same plain array body as
  before (never an envelope) plus a new `X-Total-Count` header --
  fully additive and backward compatible. `app.ts`'s CORS config gained
  `exposedHeaders: ["X-Total-Count"]`; without it the header is invisible
  to `apps/web`'s cross-origin `fetch()` calls in dev, a bug class
  supertest-based API tests cannot catch since supertest doesn't enforce
  browser header-visibility rules.
- **`apps/web`**: `DataTable.tsx` gained optional `serverSort`/
  `onServerSortChange`/`pagination` props -- a caller that doesn't pass
  them keeps its existing fully-client-side sort with zero behavior
  change (verified against every one of the ~20 other list pages already
  on `DataTable`). `lib/use-server-table.ts` -- a small local
  `useServerTable<T>` hook (debounced search, immediate filter/sort/page
  refetch, request-id guarding against out-of-order responses, reads
  `X-Total-Count`) standardizing the fetch glue every migrated module
  needs, deliberately not built on TanStack Query (see the hook's own doc
  comment: adopting a caching library to solve one hook's fetch/debounce
  logic would touch every one of the ~100 existing pages' dependency
  footprint for no problem it uniquely solves -- revisit if a real
  caching/dedup need shows up once more modules migrate).
  `components/ui/SavedViewsBar.tsx` -- a reusable saved-views bar
  generalized from Punch List's earlier bespoke single-filter version,
  backed by the pre-existing generic `/saved-views` API with no schema
  change (its `filters` column is already schemaless `jsonb`; this phase
  just flattens `search`/`sortKey`/`sortDirection` into that same blob
  alongside a module's own filter keys). The RFIs list page
  (`app/[locale]/projects/[id]/rfis/page.tsx`) was migrated end-to-end onto
  this stack: `useServerTable` replaced its local `useState`/`useEffect`
  fetch logic, `SavedViewsBar` sits above its `FilterBar` (which gained a
  new ball-in-court/assignee filter it didn't have before), and `DataTable`
  is wired to the hook's server-sort and pagination state.
- **Explicitly not built this phase, on record**: the other ~19 list
  modules (including Punch List's own data-fetching -- only its
  saved-views *UI pattern* was extracted/generalized, its page.tsx is
  untouched) were deliberately left on client-side filtering; migrating
  them is now comparatively cheap given the pattern above, and is future
  work rather than a defect. The remaining eight phases of the parent
  spec (global search, navigation/icon-rail shell, the PDF architecture
  overhaul, bulk actions, column customization, etc.) have not been
  started.

**Verification:**
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green across
  every package. 397 tests total (`packages/shared`: 200, `packages/db`: 1,
  `apps/api`: 168 across 35 files including the new 6-test
  `rfi-list-query.test.ts` -- backward compatibility with no query params,
  search, status+assignee filters, sort direction, pagination with correct
  `total`, and private-RFI exclusion from both results and count;
  `apps/web`: 28, unaffected). Two expected stderr blocks in the API test
  run (mailer/Expo-push network calls failing in this sandbox) are
  pre-existing and unrelated to this phase. Full `next build` succeeded
  with the RFIs route unaffected in size/behavior beyond the new filter.

## Assumptions (numbered — flag any that need correction before Phase 1)

1. **App name**: "SiteOps" (repository name `procorelike` is just the
   Git remote and unrelated to the product name).
2. **Company / brand**: not specified in the brief (the `{{COMPANY}}`
   placeholder was left unfilled). Treated as a generic multi-tenant
   platform with no hardcoded company branding; a real company name/logo
   can be dropped in later without schema changes.
3. **Primary locale**: English (`en`) as the default/fallback locale, with
   Arabic (`ar-JO`) fully first-class per the brief — both ship together in
   Phase 1, neither is "added later."
4. **Arabic calendar**: Gregorian calendar with `ar-JO` Arabic-Indic (or
   Latin, TBD in Phase 1 visual QA) numeral formatting via `Intl` APIs.
   Hijri calendar display is treated as out of scope for v1 unless told
   otherwise — it's a meaningfully larger scope item (dual-calendar date
   pickers throughout).
5. **Weather auto-fetch for Daily Log**: will use a no-API-key or
   low-friction provider (e.g., Open-Meteo) for Phase 5-adjacent work,
   configurable/swappable — not a paid enterprise weather API, to keep
   local dev and CI simple. Manual override always available regardless
   of provider.
6. **Email provider**: MailHog for local dev (per stack spec); production
   provider left as a configurable SMTP-compatible or transactional-API
   integration (Resend/SendGrid/Postmark-class), selected when real infra
   is chosen — not built into `packages/shared` as a hard dependency.
7. **Production hosting/infra**: not specified in the brief. Local dev is
   fully defined (docker-compose). Production topology (managed Postgres,
   container hosting, CDN, mobile app store distribution) is deferred to a
   decision point before Phase 8, once real infra constraints are known.
8. **Mobile push notifications**: not called out in the original
   functional spec (only in-app notifications and email digests were).
   Superseded by Phase 20 (user-directed follow-up), which built push
   delivery via Expo -- see Phase 20's gate report.
9. **Structured safety incidents in T1**: the brief lists "safety
   incidents" as a Daily Log field (T1 #5) but a full structured
   `safety_incidents` table only appears with the T3 Safety module (#15).
   Assumption: T1 Daily Log stores incidents as a structured-but-minimal
   sub-record (not free text) from the start, so T3 Safety can extend
   rather than migrate it. Flagged for confirmation before Phase 5/Daily
   Log finalization if you'd rather keep T1 to free text.
10. **Currency**: per-project configurable currency (not hardcoded to JOD
    or USD), since the brief doesn't specify one and the company
    directory model already implies multi-party, potentially
    multi-currency commitments in T2.
11. **Drawing revision codes**: owner/architect-supplied free text (e.g.
    `A`, `Rev-2`), not server-generated sequence numbers — unlike RFIs/
    Submittals/COs, revision codes are often contractually mandated
    externally.
12. **`packages/db` also validated for infrastructure fit**: assuming
    standard PostgreSQL 16 (no managed-service-specific extensions
    required, e.g. no assumption of Supabase/Neon-specific features),
    keeping the DB portable across hosting choices per Assumption 7.

## Resuming this build in a fresh session

1. Read this file for current phase/status.
2. Read `docs/DATA_MODEL.md` for schema.
3. Read `docs/ARCHITECTURE.md` for system design.
4. Read `CLAUDE.md` for operating rules and conventions.
5. Continue at the first unchecked phase above — do not skip ahead.
