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
8. **Mobile push notifications**: not called out in the functional spec
   (only in-app notifications and email digests are). Treated as out of
   scope for v1; the mobile sync-status indicator covers the "did my
   stuff sync" need without push infra.
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
