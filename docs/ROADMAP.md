# Roadmap — SiteOps

## Status

**Current phase: 1 (Foundation) — complete. Phase 2 (Field core) is next.**

## Module tiers (build strictly in order — T2 untouched until every T1 module passes acceptance)

### T1 — Core

| # | Module | Status |
|---|---|---|
| 1 | Projects & Directory | Foundation done: create/list projects, company directory, per-project member listing, auth+permission engine. Full directory management UI (invite/reassign from web) still pending. |
| 2 | Documents & Drawings | Not started |
| 3 | RFIs | Not started |
| 4 | Submittals | Not started |
| 5 | Daily Log | Not started |
| 6 | Punch List / Snags | Not started |
| 7 | Photos | Not started |
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
- [ ] **Phase 2 — Field core.** Daily Log, Photos, Punch List — full CRUD
      on web and Expo, offline sync + conflict resolution end to end.
      *Gate: airplane-mode test — create 5 punch items and a daily log
      offline, reconnect, all sync.*
- [ ] **Phase 3 — Document control.** Documents, folders, drawing register
      w/ revisions, PDF viewer with markup pins (web + mobile), offline
      drawing cache.
      *Gate: upload a revision, verify the old one is retained and the
      register shows current.*
- [ ] **Phase 4 — Workflow core.** RFIs and Submittals — ball-in-court,
      distribution, review workflows, response codes, overdue logic, email
      notifications, PDF export.
      *Gate: full RFI lifecycle across three users, plus an overdue
      escalation email.*
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
