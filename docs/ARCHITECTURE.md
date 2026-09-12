# Architecture — SiteOps

## 1. Monorepo shape

pnpm workspaces + Turborepo, single repo for web, mobile, API, and shared packages
so business rules and types are written once.

```
apps/
  web/        Next.js 15 App Router, React 19, TS strict — office + mobile-web users
  mobile/     Expo (React Native) + expo-router — field users, offline-first
  api/        Express 5 REST API, zod-validated boundary
packages/
  db/         Drizzle ORM schema, migrations, seed scripts (source of truth for DB shape)
  shared/     Zod schemas, TS types, permission engine, numbering/ball-in-court/
              approval-threshold business logic — imported by web, mobile, api
  ui/         Design tokens + shared shadcn/ui-based web components
docs/         This documentation set
```

`packages/shared` is the only place business rules are allowed to live. Both
`apps/api` (authoritative) and the clients (for responsive UX / optimistic
updates) import from it, so a rule is defined once and enforced twice
(client for UX, server for truth).

## 2. Request flow (web/mobile → API → DB)

```
Client (web: TanStack Query / mobile: WatermelonDB+outbox)
   → HTTPS → apps/api (Express 5)
        → zod validation at the boundary (reject unknown keys)
        → permission check (packages/shared engine, using JWT claims + project_user_permissions)
        → Drizzle query, scoped by project_id / company_id
        → PostgreSQL, Row-Level Security as the last line of defense
        → audit_log write (append-only) for every mutation
   ← JSON response
```

RLS is defense-in-depth, not the primary mechanism: the API always scopes
queries explicitly by `project_id`/`company_id` derived from the authenticated
session, and RLS policies mirror the same rule at the database level so a bug
in application-layer scoping cannot leak cross-tenant data.

## 3. Auth

- JWT access token (short-lived) + refresh token (longer-lived, per device,
  stored hashed server-side) — mobile sessions survive across app restarts
  without re-login.
- Passwords hashed with argon2id.
- Onboarding is invite-only: an `owner_admin`/`admin`-permission user invites
  by email → signed invite token → set-password flow.
- Optional TOTP 2FA, enforceable per role (recommended mandatory for
  `owner_admin`).
- Every request carries a correlation ID (generated at the edge if absent),
  logged on both the request and any resulting audit_log/error entry, so a
  user-visible error can be traced server-side.
- **Two DB connections, on purpose** (`apps/api/src/db.ts`): `appDb` connects
  as the RLS-enforced `siteops_app` role and is used for everything once a
  caller is authenticated. `authDb` connects as the migration superuser and
  bypasses RLS — used *only* for the handful of lookups that have no tenant
  context yet to scope by: finding a user by email at login, an invite by
  its token hash, a refresh token by its hash. Each of those substitutes its
  own strong check (password verify, invite expiry/single-use, hash match)
  for RLS at that moment; every other read/write, including inserting the
  resulting `users`/`project_users`/`refresh_tokens` rows once the caller is
  known, goes through `appDb` with `app.user_id` set to that now-verified
  identity.

## 4. Permission enforcement — three layers, all required

1. **UI layer** (web/mobile): hide/disable actions the user's permission
   level doesn't allow. UX only — never trusted for security.
2. **API layer** (`packages/shared` permission engine): every route resolves
   the caller's effective permission (`permission_templates` merged with
   `project_user_permissions` overrides) for the module in question and
   rejects before touching the DB. Financial modules additionally check
   role-based data visibility (e.g., `client_viewer` is refused at this layer
   for budget/commitments/billing routes — not just hidden in the UI).
3. **Database layer** (Postgres RLS): policies on every tenant-scoped table
   keyed on `project_id`/`company_id` matched against the session's claims
   (set via `SET LOCAL` per-request from the JWT). This is the backstop if 1
   or 2 has a bug.

Approval-threshold logic (change orders above a configurable amount require a
second approver from a different company/role) lives in `packages/shared` and
is evaluated server-side on the state-transition endpoint, not the client.

## 5. File storage

- S3-compatible object storage (MinIO locally; any S3-compatible endpoint in
  prod via config).
- Clients request a pre-signed upload URL from the API (which checks
  write-permission on the target project/module first), upload directly to
  storage, then confirm completion to the API, which records the
  `attachments` row. Files never proxy through the API process.
- Downloads: same pattern in reverse — short-lived pre-signed GET URLs,
  issued only after a permission check.

## 6. Offline sync (mobile)

- Local store: **expo-sqlite**, not WatermelonDB as originally locked in
  §4/CLAUDE.md — see the Phase 2 gate report in `docs/ROADMAP.md` for why
  (WatermelonDB's SQLite adapter needs a compiled custom dev client, which
  this sandbox has no way to build or run; expo-sqlite is Expo Go-compatible
  and official). The repository layer (`apps/mobile/lib/db/*-repo.ts`) is
  the only place that knows the storage engine, so swapping it later touches
  those two files, not the sync engine or any screen.
- Phase 2 ships offline CRUD for **Daily Log** and **Punch List** only.
  Photos are create/upload-only (no offline edit or offline capture queue
  yet); Inspections and RFI creation stay out of scope for offline until a
  later phase.
- Every locally-created/edited record queues in an **outbox** (one row per
  `entityType:localId`, so repeated offline edits before a sync collapse
  into a single queue entry). `apps/mobile/lib/sync/sync-engine.ts` drains
  it against `POST /sync/push` when the user taps "Sync now" or a field
  screen mounts — there is no background task or connectivity listener in
  Phase 2 (flagged as a scope reduction, not silently dropped): a network
  failure during sync degrades to `ranOffline: true`, and everything stays
  queued for the next manual attempt rather than retrying itself.
- Pull side: `GET /sync/pull?since=<cursor>` returns everything changed for
  the project since the last cursor, keyed by `server_revision` (monotonic
  per record) — not wall-clock time, to avoid clock-skew bugs. A pull never
  overwrites a local record that has an unsynced edit or an open conflict;
  reconciling those happens on push, not pull.
- **Conflict policy**: last-write-wins per *field* using the server revision
  the client last saw (`mergeFields` in `packages/shared/src/sync/merge.ts`,
  shared verbatim between the merge logic's tests and its production use in
  `apps/api`'s push handlers). If the server revision advanced on the same
  field since the client's base, that field is a genuine conflict: both
  versions are kept, the record is flagged `needs_review`, and the mobile
  detail screen surfaces the conflicting values inline (not a separate
  resolution screen — editing the field and syncing again resolves it, same
  as the web app). Non-conflicting fields merge cleanly. Never silently
  drop a field.
- **Punch item status transitions are online-only**, not part of the
  outbox/merge protocol: a transition (`open` → `ready_for_review` → …)
  carries workflow validation (`PUNCH_ITEM_STATUS_TRANSITIONS`) that isn't
  expressed as a field-level merge, so the mobile app calls
  `POST /punch-items/:id/transition` directly and disables the buttons
  until the record has synced at least once. Creating items and editing
  description/notes work fully offline.
- **Photos**: capture → client-side compress to ≤2MB / 2048px long edge →
  write to local store immediately (so the UI never blocks on network) →
  enqueue upload → background upload with retry → local copy retained until
  the server confirms receipt. Per-photo sync state (`pending` / `uploading`
  / `synced` / `failed`) is visible in the UI. *(Not yet implemented on
  mobile — Phase 2 mobile photos are out of scope; web-only for now.)*
- **Drawings offline**: a drawing set marked "available offline" has its
  current-revision PDFs fetched and cached to local device storage; the
  in-app viewer renders from cache when offline, only fetching if the
  revision isn't cached. *(Not yet implemented — later phase.)*
- A persistent sync-status bar (pending item count, last successful sync
  time, a manual "Sync now" action) is shown on every field-module screen
  (`apps/mobile/components/SyncStatusBar.tsx`).

## 7. Numbering

Human-readable record numbers (`RFI-0042`, `SUB-03.30.00-002`, `CO-007`) are
generated by a Postgres function reading/incrementing `number_sequences`
under a per-project row lock (`SELECT ... FOR UPDATE` on the sequence row),
inside the same transaction as the record insert. This guarantees no gaps
from failed transactions are *silently* reused and no two concurrent inserts
collide — throughput cost is acceptable given the target of 100 concurrent
users per project, not 100 concurrent *creates* of the same record type.

## 8. Search

Postgres full-text search (`tsvector` columns + GIN indexes) across
documents, RFIs, submittals, punch items, and daily logs, combined into a
per-project search endpoint. Revisit for a dedicated search engine
(e.g., Meilisearch/OpenSearch) only if FTS performance/relevance proves
insufficient against the 100k-row seed — not built pre-emptively.

## 9. i18n / RTL

- `next-intl` (web) / `i18n-js` (mobile) drive all user-facing strings; no
  hardcoded copy anywhere in components.
- `dir="rtl"|"ltr"` is set at the root layout based on active locale and
  flips the whole layout via logical CSS properties
  (`margin-inline-start`, `padding-inline-end`, etc.) — never physical
  `left`/`right` properties in component styles.
- Arabic-safe font stack (e.g., Noto Sans Arabic / IBM Plex Sans Arabic)
  loaded alongside the Latin font; number/date formatting uses `Intl`
  APIs with the `ar-JO` locale (Arabic-Indic vs. Latin digit choice,
  Hijri vs. Gregorian is a Phase-1 decision — see Assumptions).
- Both locales are exercised by seed data (Phase 0 §10 of the master brief),
  not just the UI chrome.

## 10. Testing strategy

| Layer | Tool | Minimum bar |
|---|---|---|
| `packages/shared` business rules | Vitest | Every permission check, every numbering/ball-in-court/threshold rule |
| API routes | Supertest | Every mutation route: happy path + at least one permission-denial path |
| Cross-tenant isolation | Supertest + RLS | Per T1/T2 module: "Company B cannot read Company A's record" |
| Web flows | Playwright | Critical path per module (create → workflow transition → close) |
| Mobile flows | Maestro | Offline create → reconnect → sync, per offline-capable module |

## 11. Local dev environment

`docker-compose.yml` brings up Postgres 16, MinIO, and MailHog. `pnpm dev`
(Turborepo pipeline) starts `apps/api`, `apps/web`, and Metro for
`apps/mobile` together. `packages/db`'s seed script runs against the compose
stack. Target: a new developer is running with seeded data in under 5
minutes from `git clone`.

## 12. Deployment (prod) — open question

The master brief does not specify a target hosting platform. Local dev is
fully specified (docker-compose); production topology (managed Postgres
provider, container host / k8s / PaaS, CDN for web, push notification
service if mobile push is added later) is deferred to a pre-Phase-8
decision once the team knows real infra constraints. Noted as Assumption
in `docs/ROADMAP.md`.
