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
| Offline (mobile) | expo-sqlite + outbox queue, `/sync/pull` + `/sync/push` (was WatermelonDB per this table's original lock — see `docs/ROADMAP.md` Phase 2 gate report for the deviation and why) |
| Push (mobile) | expo-notifications + Expo's push API (`exp.host`) — added Phase 20, no EAS project configured yet (deployment-time step) |
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
status table, and each phase's gate report (what was verified, known gaps,
mid-build corrections). As of this writing: **Phase 30 (Arabic-safe PDF
exports) is complete and gate-verified** -- closing the crash-severity
half of the PDF architecture overhaul the Phase 28 architectural-audit
check-in flagged as unaddressed. Every PDF report generator drew text
with pdf-lib's built-in `StandardFonts.Helvetica`, a WinAnsi (Latin-1)
font whose `drawText` **throws** on any character outside that encoding
-- confirmed empirically before writing the fix -- so any exported field
containing Arabic text (this is a bilingual EN/AR product) crashed the
export with a 500. Fixed by embedding Noto Sans Arabic (SIL OFL 1.1,
sourced via `npm pack @expo-google-fonts/noto-sans-arabic`, verified via
`@pdf-lib/fontkit` glyph-coverage checks to cover Latin+Arabic in one
file) as `PdfBuilder`'s single font pair, replacing Helvetica/
HelveticaBold everywhere rather than switching fonts per line. A new
pure helper, `apps/api/src/lib/bidi-text.ts`'s `prepareBidiLine`, fixes
reading direction with a pragmatic word-level reorder (first-strong-
character direction detection, word + in-word character reversal for
RTL-dominant text) -- explicitly **not** the full Unicode Bidirectional
Algorithm and **not** Arabic contextual letter-shaping/joining, which
would need a real shaping engine (HarfBuzz); `arabic-reshaper` was
evaluated and rejected as GPL-3.0-licensed. See `docs/DATA_MODEL.md`
§9r for the full writeup and `docs/ROADMAP.md`'s Phase 30 gate report
for verification.

Phase 29 (sidebar icon-rail) preceded this -- the second concrete gap
the Phase 28 architectural-audit check-in surfaced against the full
42-section "Enterprise UX, Data Architecture & PDF System Upgrade" spec:
its Section 10 explicitly asks to replace the collapsed sidebar's
first-letter rendering with "a more understandable icon-rail approach,"
and `ProjectSidebar.tsx`'s collapsed mode was still doing exactly
`{t(item.labelKey).slice(0, 1)}`. Added `lucide-react` (this repo's
first icon dependency) and gave all 31 `NavItem` entries across the 6
`NAV_GROUPS` a distinct, semantically-chosen icon (e.g. `HelpCircle` for
RFIs, `Gavel` for Bidding, `ShieldAlert` for Safety); collapsed mode now
shows the icon instead of a letter, with the pre-existing `sr-only`
label and `title` tooltip left untouched, and expanded mode picked up
the same icon next to its label for continuity across the toggle.
Verified with Playwright against the dev servers, including that Arabic
(`/ar/...`) still renders `dir="rtl"` with the correct translated label
-- no RTL/i18n regression from the icon swap. See `docs/DATA_MODEL.md`
§9q for the full writeup.

Phase 28 (DataTable row selection + a bulk-actions pilot on RFIs)
preceded this -- built after the same architectural-audit check-in
turned up two concrete open items: `DataTable.tsx`'s own
doc comment has flagged bulk row selection as deferred since its first
build, and the spec's Section 17 requires the API to independently
enforce permissions regardless of UI state (already true here --
`requirePermission` runs inside `transitionRfiStatus` itself). Bulk
actions are piloted on one module before any wider rollout, same staging
discipline Phase 21 used for the list-query contract: `DataTable` gained
an optional `selection` prop (checkbox column + header "select all,"
scoped to whatever's currently rendered), a new generic
`BulkActionsBar` component, and one real action -- `POST
/rfis/bulk-transition`, a thin loop over the exact same
`transitionRfiStatus` a single-item PATCH already uses, rejecting the
whole batch with 400 if the selected ids span more than one project
(loading one `PermissionContext` for a mix of projects would apply the
wrong project's role to some rows) and reporting a per-row failure (e.g.
one already-closed RFI) without failing the rest of the batch. See
`docs/DATA_MODEL.md` §9p for the full design and what's explicitly still
deferred (bulk actions on other modules, column resize, density modes,
and client-side permission-aware UI hiding -- a UX gap, not a security
one, since the API enforces regardless). The audit that opened this
phase is also worth keeping in mind for what comes next: the much larger
remaining half of the parent spec -- the PDF architecture overhaul, most
notably Arabic font embedding (confirmed still `StandardFonts.Helvetica`
only, a real gap for a bilingual product), document-viewer unification,
and annotation generalization -- has not been started.

Phase 27 (DataTable column visibility) preceded this: `DataTable.tsx`
gained an optional per-column `hideable` flag and a table-level
`storageKey` prop that turns on a "Columns" show/hide menu, persisted per
browser via `localStorage` (the same per-browser-only pattern
`GlobalSearch`'s recent-searches already use, not a database-backed
preference -- see `docs/DATA_MODEL.md` §9o). All ~20 pages already on
`DataTable` got a unique `storageKey` in that phase. Scoping it also
surfaced that two other items the parent spec's remaining-work list
names -- global search and the navigation/icon-rail shell -- already
exist (`search.service.ts` + `GlobalSearch.tsx`, `components/shell/`),
shipped in an earlier, un-phase-tracked "UX/UI foundation pass" predating
Phase 21's numbering; Phase 27's gate report records that correction
rather than re-building them. Phase 26 (server-driven list query
contract rolled out to Schedule, Bidding, and Estimating) preceded that,
closing out the list-query-contract half of the initiative -- every real
list module in the app has server-side search/filter/sort/pagination. No
changes to the shared contract
(`packages/shared/schemas/list-query.schema.ts`, `PaginatedResult<T>`)
itself this phase. Schedule's pre-migration default order was an in-JS
sort on `sortOrder, startDate` (a manual drag-order), not one column like
every other module, so its query schema deliberately preserves that exact
ordering when `sort` is omitted rather than falling back to a single
default column -- the one exception to every other module's convention,
called out in both the shared schema and the service. Bidding's Cost Code
column got the same "drop `sortValue`" treatment as Direct Costs' in
Phase 25 (a joined lookup by `costCodeId`, with `number`/`title` already
giving the module a real search/sort surface); Estimating needed no
column-bug fixes at all, every column already being a plain field. This
phase also corrected `docs/DATA_MODEL.md` §9n's "migrated so far" list to
state plainly that the initiative is complete -- any new list module
added going forward should follow this pattern from the start rather than
shipping client-side filtering to migrate later. Phase 25 (Direct Costs,
Payment Applications/Billing, Prequalification, Safety Observations)
preceded this -- two of its modules (Payment Applications,
Prequalification) had no plain text column at all, so their
`listPaymentApplications`/`listPrequalifications` join to
`commitments`/`companies` respectively to get something to search and
sort on, the same join-for-search-and-sort treatment Inspections gave
`checklist_templates` in Phase 24; Prequalification and Safety
Observations also aren't `DataTable` consumers (they render expandable
card lists), so their migrations wire `useServerTable` for
search/filter/pagination plus a plain `<select>` sort control and a
hand-rolled pagination footer matching `DataTable`'s markup, a recipe
Phase 26 had no need to reuse since Schedule/Bidding/Estimating are all
`DataTable` pages. Phase 25 also corrected a documentation error carried
since Phase 23: Prime Contract was listed as a pending list-module
migration, but it's a one-per-project singleton with a detail/edit page,
not a list, and has no `list*` service function at all -- it remains
correctly excluded. Phase 24 (Inspections, T&M Tickets, Transmittals,
Safety Incidents) preceded that, Phase 23 (Documents, Drawings, Meetings,
Correspondence) before that, Phase 22 (Submittals, Change Orders, Punch
List, Commitments) before that, and Phase 21 (RFIs, the original proof of
concept) before that. Before Phase 21, Phase 20
(Mobile push notifications) completed the sixth of 7 planned phases
addressing a Procore competitive-gap analysis (see Phase 15's gate report
for the full 7-phase plan); SSO/SAML was explicitly descoped by the user
pending a real enterprise customer. The original
10-item gap list's items #1, #10, #13 were never recorded verbatim in
this repo (only #5-#9/#11/#12 got named in their own gate reports), so
Phase 20 closed a different, long-standing item instead: Assumption #8
("mobile push notifications," on record since Phase 1) rather than guess
at the missing numbering -- flagged plainly in Phase 20's own gate
report. Phase 16 added notifications
(`notification.service.ts`, wired into RFI/Submittal/Punch Item/Change
Order key events, surfaced via a header bell) and workflow transition
rules (`workflow-rule.service.ts`, letting a `directory:admin` narrow —
never widen — the RFI and Punch List modules' hardcoded status-transition
machines from the project Settings page). Phase 17 added
`analytics.service.ts` (`GET /projects/:id/analytics`, the first real use
of the long-defined `reports` permission module) — trend charts and
cycle-time metrics for RFIs/Punch List/Submittals/Safety/Change Orders,
all derived from timestamps the app already stores rather than a
synthetic snapshot history — plus CSV register-export twins of the
existing PDF "export all" registers. Phase 18 added Action Plans
(`action-plan-template.service.ts`, `action-plan.service.ts`): an
admin-defined, reusable template of action items that instantiates in
one step into ordinary `corrective_actions` rows (each stamped with an
`action_plan_id`) rather than a parallel tracking system, so a plan's
status is always derived from those rows' own statuses, never stored
separately. Applied from the existing `CorrectiveActionsPanel` on Safety
Incident/Observation pages. Phase 19 added email-to-project logging
(`inbound-email.service.ts`, `POST /internal/inbound-email` — a
shared-secret-gated webhook, not a session route): every project now has
a unique `<inbound_email_token>@INBOUND_EMAIL_DOMAIN` alias (shown with a
copy button on the project Settings page); mail CC'd or forwarded there
by a registered, current project member with `correspondence:standard`
is logged as an ordinary incoming `correspondence` row, attachments and
all, through the same permission gate and the same `attachments` table
manual creation already uses — no parallel inbox, no new correspondence
subtype. Wiring a real inbound-email provider (SendGrid Inbound Parse /
Mailgun Routes / SES) is a deployment-time config step outside this
repo, since translating a provider's native webhook format into this
app's generic payload contract varies per provider and no production
inbound-email account exists yet. Phase 20 extended Phase 16's
notification pipeline to `apps/mobile` via Expo push: a new `push_tokens`
table, and `notifyUser()` (the one choke point every existing
notification call site already goes through) now also fires a
fire-and-forget push to every device a recipient has registered, never
awaited, every failure swallowed — the same "best-effort side effect"
posture `auth.service.ts` already takes for invite emails. Registration
happens in `apps/mobile`'s `AuthProvider` on login/relaunch; a tapped
notification deep-links straight to its RFI/Submittal/Punch Item/Change
Order screen.

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
