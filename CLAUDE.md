# CLAUDE.md — SiteOps

> Orientation for any Claude Code session (or human) resuming this build.
> Read this file, then `docs/ROADMAP.md` (current phase + status), then
> `docs/DATA_MODEL.md` (schema) before touching code.

## 1. What this is

**SiteOps** is a mobile-first construction project management
platform, functionally modeled on Procore's core project-management,
quality-and-safety, and financial-controls product lines. Target users:
general contractors, subcontractors, consultants, and owners. Field users
work on phones, often offline. Office users work on desktop browsers.

Bilingual from day one: **English and Arabic (ar-JO) are both first-class**,
including full RTL layout support — this is not a post-hoc localization pass.

This is a multi-session build executed phase-by-phase (see `docs/ROADMAP.md`).
**Never start phase N+1 before the phase-N gate is explicitly approved.**

## 2. Non-negotiable operating rules

1. Plan before code — schema and architecture changes get written to
   `docs/DATA_MODEL.md` / `docs/ARCHITECTURE.md` before or alongside the code.
2. One phase at a time. Stop at every gate in `docs/ROADMAP.md` and report:
   what was built, how to run it, what to click to verify, known gaps.
3. Ambiguous business rules → ask with 2–3 concrete options + a recommendation,
   rather than guessing when a wrong guess costs rework.
4. No stub screens presented as working features. Label scaffolding `TODO`
   in the UI and call it out in the phase gate report.
5. Every phase ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
6. Migrations are forward-only, checked into `packages/db`, never edited after
   merge. No destructive schema changes against seeded data without a
   migration.
7. Tests are written alongside the code they cover — every service-layer
   function with a business rule, every permission check, every offline-sync
   conflict path.
8. Update this file and `docs/DATA_MODEL.md` at the end of every phase.
9. No `any`, no `@ts-ignore`, no silent `catch`. Errors surface to the user
   with an actionable message and to the server log with a correlation ID.
10. No new dependency outside the locked stack (below) without flagging
    bundle-size / maintenance cost first.
11. Business rules live in `packages/shared` and are re-verified server-side —
    never trust a client-only check (esp. permissions, financial thresholds).
12. Numbering (`RFI-0042`, `CO-007`, ...) is always server-generated via a DB
    function against `number_sequences`, never a client counter or timestamp.

## 3. Tech stack (locked — see `docs/ARCHITECTURE.md` for rationale)

| Area | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 15 (App Router), React 19, TypeScript strict |
| Mobile | Expo (React Native) + expo-router, TypeScript |
| API | Express 5 + TypeScript (REST), zod validation |
| DB | PostgreSQL 16, Drizzle ORM, Row-Level Security |
| Auth | JWT access+refresh, argon2, email invite, per-device refresh tokens, optional TOTP 2FA |
| Storage | S3-compatible (MinIO dev), pre-signed URLs only |
| Offline (mobile) | WatermelonDB + outbox queue, `/sync/pull` + `/sync/push` |
| Web data/state | TanStack Query + Zustand (UI state only) |
| PDF | pdf-lib (generate), pdf.js (view/markup) |
| i18n | next-intl (web), i18n-js (mobile); logical CSS properties only |
| Testing | Vitest, Supertest, Playwright, Maestro |
| Local dev | docker-compose: Postgres + MinIO + MailHog |

## 4. Repo layout

```
apps/web        Next.js 15 App Router — login, projects, directory (next-intl EN/AR)
apps/mobile     Expo (React Native) + expo-router — minimal scaffold; field modules start Phase 2
apps/api        Express 5 REST API — auth, companies, projects, directory, attachments
packages/db     Drizzle schema (55 tables), migrations, RLS + numbering SQL, seed
packages/shared Types, zod schemas, permission engine, business rules (+ /server subpath for argon2)
packages/ui     Not created yet — Phase 1 kept styling inline in apps/web; extract once
                there's enough shared UI across web to justify it
docs/           ARCHITECTURE.md, DATA_MODEL.md, ROADMAP.md
```

## 5. Where things stand

See `docs/ROADMAP.md` for the authoritative phase checklist, module-tier
status table, and the Phase 1 gate report (what was verified, known gaps,
mid-build corrections). As of this writing: **Phase 1 (Foundation) is
complete and gate-verified in a real browser; Phase 2 (Field core) is next.**

Two things worth knowing before touching
`packages/db/src/sql/001_rls_and_functions.sql`: a table's RLS policy must
never subquery itself (or another table whose policy subqueries it back)
without going through a `SECURITY DEFINER` helper first — see
`is_project_member`/`is_company_visible` and the comment above them in that
file. And the API deliberately holds two DB connections
(`authDb`/`appDb`, see `apps/api/src/db.ts`) — only the three genuinely
pre-authentication lookups (login-by-email, invite-token, refresh-token) use
the RLS-bypassing one.

## 6. Key conventions to hold the line on

- **Permissions**: per-module, per-project, four levels (`none`/`read`/
  `standard`/`admin`). Enforced server-side at the query layer — a
  `client_viewer` cannot reach cost data even via a crafted request; a
  `subcontractor` only sees records where their company is assignee,
  ball-in-court, or an explicit distribution recipient.
- **Audit log**: every mutation writes an immutable `audit_log` row
  (actor, entity, action, before/after diff, IP, timestamp). Never
  updated or deleted.
- **i18n**: no hardcoded user-facing strings, no `margin-left`/`margin-right`
  (logical properties only), `dir` switches the whole layout, ar-JO number/
  date formatting.
- **Offline conflicts**: last-write-wins per field with a server revision
  check; genuine conflicts keep both versions and flag `needs_review` for
  manual resolution — never silently discard a field entry.
- **Out of scope for v1**: bidding/tender marketplace, BIM/IFC model
  viewing, ERP accounting integration, timecard payroll export, equipment
  telematics.

## 7. Assumptions on record

See the numbered assumptions list in `docs/ROADMAP.md` §"Assumptions",
kept current there as the source of truth.
