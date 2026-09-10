# Roadmap — ProcoreLike (SiteOps)

## Status

**Current phase: 0 (Plan) — complete, awaiting approval to begin Phase 1.**

## Module tiers (build strictly in order — T2 untouched until every T1 module passes acceptance)

### T1 — Core

| # | Module | Status |
|---|---|---|
| 1 | Projects & Directory | Not started |
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
- [ ] **Phase 1 — Foundation.** Monorepo, docker-compose, full Drizzle
      schema + migrations, RLS policies, auth (register/invite/login/
      refresh/2FA), companies, projects, directory, permission engine in
      `packages/shared`, audit log, numbering function, attachment
      service w/ pre-signed URLs, i18n scaffolding with Arabic RTL working,
      seed script.
      *Gate: log in as three different roles on web, see correctly scoped
      projects, UI flips cleanly between Arabic and English.*
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

## Assumptions (numbered — flag any that need correction before Phase 1)

1. **App name**: "ProcoreLike" (from the repository name). Easy to rename
   later — not load-bearing on any architecture decision.
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
