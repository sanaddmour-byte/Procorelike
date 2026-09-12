# Roadmap — SiteOps

## Status

**Current phase: 4 (Workflow core: RFIs/Submittals) — complete. Phase 5 (Quality: inspections) is next.**

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
| 8 | Inspections & Checklists | Not started |

### T2 — Financial & Commercial

| # | Module | Status |
|---|---|---|
| 9 | Budget | Not started |
| 10 | Commitments | Not started |
| 11 | Change Management | Not started |
| 12 | Progress Billing | Not started |
| 13 | Meetings | Not started |

### T3 — Extended

| # | Module | Status |
|---|---|---|
| 14 | Schedule | Not started |
| 15 | Safety | Not started |
| 16 | T&M Tickets / Field Productivity | Not started |
| 17 | Reports & Dashboards | Not started |
| 18 | Correspondence / Transmittals | Not started |

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
- [ ] **Phase 5 — Quality.** Checklist templates, inspections, failed-item
      → punch-item generation, signed PDF inspection report.
      *Gate: run a template-driven inspection on mobile offline, sync,
      export the report.*
- [ ] **Phase 6 — Financials (T2).** Budget, commitments, change
      management, progress billing.
      *Gate: a change order flows through approval and updates the budget
      forecast correctly, and `client_viewer` provably cannot reach any of
      it.*
- [ ] **Phase 7 — Meetings, reports, dashboards, saved views, scheduled
      digests.**
- [ ] **Phase 8 — Hardening.** Performance pass against 100k-row seed
      data, E2E suites, error boundaries, empty/loading/error states
      everywhere, deployment docs, backup/restore runbook.

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
