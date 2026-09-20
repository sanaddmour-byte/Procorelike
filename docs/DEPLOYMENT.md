# Deployment

Per `docs/ROADMAP.md` assumption 7/12, this project doesn't commit to a
specific hosting vendor — everything here is standard PostgreSQL 16 +
Node.js + a static/SSR web build + an S3-compatible object store, so it
runs on any host that provides those. What follows is the generic
procedure; substitute your actual infrastructure's specifics (managed
Postgres connection string, container platform, CDN, etc).

## Components to deploy

| Component | What it is | Where it runs |
|---|---|---|
| `apps/api` | Express API (stateless, horizontally scalable) | Any Node 22 host / container |
| `apps/web` | Next.js 15 app (SSR + static) | Any Node 22 host, or a platform with first-class Next.js support |
| `apps/mobile` | Expo/React Native app | Built via EAS, distributed through the App Store / Play Store |
| Postgres 16 | Primary datastore, RLS-enforced | Any managed or self-hosted Postgres 16 |
| S3-compatible storage | Attachments (photos, documents, drawings) | Any S3-compatible bucket (AWS S3, MinIO, R2, etc) |
| SMTP | Overdue-RFI and daily-digest emails | Any SMTP-compatible or transactional-API provider |

`apps/mobile` needs no server of its own — it only talks to `apps/api`.

## 1. Provision Postgres

1. Create a Postgres 16 instance and an initial superuser-equivalent
   role/database (this becomes `DATABASE_URL`).
2. Run migrations from a machine with network access to that database:
   ```
   DATABASE_URL=<superuser connection string> pnpm --filter @siteops/db migrate
   ```
   This applies the Drizzle schema migrations *and*
   `packages/db/src/sql/001_rls_and_functions.sql`, which creates the
   non-superuser `siteops_app` role and every RLS policy. Row-Level
   Security is not optional infrastructure here — `apps/api`'s entire
   security model depends on `DATABASE_URL_APP` connecting as that role
   with RLS enforced. Skipping this step, or pointing `DATABASE_URL_APP`
   at a superuser, defeats tenant isolation.
3. Set `DATABASE_URL_APP` to a connection string for the `siteops_app`
   role the migration created, against the same database.
4. Optionally seed demo data (`pnpm --filter @siteops/db seed`) — do
   **not** run this against a real production database; it's a fixed
   set of demo companies/projects/users meant for local dev and
   `perf-check.ts`.

## 2. Configure environment variables

Copy `.env.example` and replace every value, in particular:

- `DATABASE_URL` / `DATABASE_URL_APP` — from step 1, not the local
  docker-compose defaults.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `INVITE_TOKEN_SECRET` /
  `INTERNAL_JOB_SECRET` — generate real random secrets
  (`openssl rand -hex 32`), one each, never reused across environments.
- `S3_*` — a real bucket's endpoint/region/credentials, not MinIO.
- `SMTP_*` — a real SMTP host or transactional-API-compatible relay,
  not MailHog.
- `CORS_ORIGIN` — the deployed web app's real origin.
- `NEXT_PUBLIC_API_URL` (web build) / `EXPO_PUBLIC_API_URL` (mobile
  build) — the deployed API's real origin. Both are baked in at build
  time, not read at runtime, so a URL change means a rebuild.

## 3. Build and run apps/api

```
pnpm install --frozen-lockfile
pnpm --filter @siteops/api build   # typechecks; there's no bundle step, it runs from TS via tsx
pnpm --filter @siteops/api start
```

Runs on `API_PORT` (default 4000). Put a reverse proxy in front for
TLS; the app itself speaks plain HTTP.

## 4. Build and run apps/web

```
pnpm install --frozen-lockfile
NEXT_PUBLIC_API_URL=https://api.example.com pnpm --filter @siteops/web build
pnpm --filter @siteops/web start
```

Standard Next.js production server (`next start`), or adapt
`next build`'s output to your platform's Next.js integration if it has
one.

### 4a. Deploying apps/web to Vercel specifically

`apps/web` is a plain Next.js 15 app with exactly one runtime dependency
on the outside world -- `NEXT_PUBLIC_API_URL`, the deployed `apps/api`
origin -- and no server-side routes of its own (`app/` has no
`route.ts`/API handlers; every data call goes through `lib/api-client.ts`
to that external API). That makes it a first-class fit for Vercel as-is.
`apps/api` itself is a stateful Express server (direct Postgres
connections, PDF generation, file uploads) and is **not** part of this
Vercel deployment -- keep running it per steps 1-3 and 5 above, on any
Node 22 host (Railway, Render, Fly.io, a VM, etc), and point
`NEXT_PUBLIC_API_URL` at wherever that ends up.

1. **Import the repo** in the Vercel dashboard (New Project → import
   `sanaddmour-byte/procorelike` from GitHub).
2. **Set the project's Root Directory to `apps/web`.** This is a
   dashboard setting (Project Settings → General → Root Directory), not
   a file in the repo. Vercel auto-detects the Next.js framework preset
   once this is set.
3. **Leave Install/Build Command on their defaults.** This repo is a
   pnpm workspace (`pnpm-workspace.yaml` + a root `pnpm-lock.yaml`,
   `packageManager: "pnpm@10.33.0"` pinned in the root `package.json`);
   Vercel detects that automatically from the Root Directory setting and
   runs `pnpm install` from the *workspace root* (not `apps/web`) so the
   `@siteops/shared` workspace dependency resolves correctly, then runs
   `next build` inside `apps/web`. `@siteops/shared` has no separate
   build step of its own -- `next.config.mjs`'s `transpilePackages`
   already tells Next.js to transpile it straight from TypeScript
   source, so nothing extra needs to run before `next build`.
4. **Add the one environment variable**: `NEXT_PUBLIC_API_URL` = your
   deployed API's public origin (e.g. `https://api.example.com`), set
   for Production (and Preview/Development if you want preview
   deployments to hit a staging API). It is baked in at build time, so
   changing it requires a redeploy, not just a restart.
5. **Deploy.** Every push to the tracked branch triggers a new build;
   Vercel's own preview-deployment flow applies to PRs as usual.
6. Confirm the deployed site can reach the API: log in as a seeded (or
   real) user and confirm a list page loads data. A CORS error in the
   browser console means `apps/api`'s `CORS_ORIGIN` doesn't yet include
   the Vercel deployment's origin -- update it there and restart the API.

### 4b. Deploying apps/api to Vercel too (both on one platform)

`apps/api` is an Express server, and Vercel's Node.js runtime hosts
serverless functions rather than a long-running server -- but an Express
app is itself a valid `(req, res)` request handler, so
`apps/api/api/index.ts` wraps `createApp(...)`'s result directly for
that runtime with no changes to any route or service code.
`apps/api/vercel.json` rewrites every incoming path to that one
function, so Express's own routing still sees the original path (e.g.
`/auth/login`) exactly as it does on any other host.

This is a separate Vercel project from `apps/web` (two projects, one
account):

1. **Import the repo a second time** in Vercel, or add a new project
   from the same GitHub repo.
2. **Set this project's Root Directory to `apps/api`.**
3. **Add environment variables** -- everything in `.env.example` that
   has no safe default for production: `DATABASE_URL`,
   `DATABASE_URL_APP`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
   `INVITE_TOKEN_SECRET` at minimum (generate each with
   `openssl rand -hex 32`, three different values), plus `CORS_ORIGIN`
   set to the `apps/web` Vercel deployment's origin once you know it.
   `S3_*`/`SMTP_*`/`INTERNAL_JOB_SECRET`/`INBOUND_EMAIL_*` all have
   working defaults and can be added later, once file uploads or email
   are actually needed.
4. **Provision Postgres.** Vercel's own Storage tab offers a Postgres
   integration (Neon-backed); its connection string becomes
   `DATABASE_URL`. Either way, step 1-2 above (running the migration,
   which creates `DATABASE_URL_APP`'s role) still has to happen from a
   machine with network access to that database -- there is no
   dashboard button for it.
5. **Deploy.** Vercel gives this project its own URL
   (e.g. `https://your-api.vercel.app`) -- use that as `apps/web`'s
   `NEXT_PUBLIC_API_URL`.
6. **Scheduled jobs**: Vercel's own Cron Jobs feature (Project Settings
   → Cron Jobs, or a `crons` array in `vercel.json`) can call the same
   two `/internal/*` endpoints step 5 above describes, on the same
   schedule, instead of an external cron service.
7. Cold starts and per-invocation Postgres connections are real
   tradeoffs of this path that a persistent Node host (4a's alternative)
   doesn't have -- fine for light/personal use, worth reconsidering
   under sustained load.

## 5. Wire up the scheduled jobs

There is deliberately no in-process scheduler (see
`apps/api/src/jobs/*.ts` doc comments) — an external cron (or your
platform's scheduled-task equivalent) must call these two endpoints:

```
# hourly, catches newly-overdue RFIs and re-escalates ones still overdue
curl -X POST https://api.example.com/internal/rfi-overdue-check \
  -H "x-internal-job-secret: $INTERNAL_JOB_SECRET"

# daily, emails each user their open ball-in-court RFIs + assigned punch items
curl -X POST https://api.example.com/internal/daily-digest \
  -H "x-internal-job-secret: $INTERNAL_JOB_SECRET"
```

Example crontab if you're running your own scheduler:

```cron
0 * * * *  curl -fsS -X POST https://api.example.com/internal/rfi-overdue-check -H "x-internal-job-secret: $INTERNAL_JOB_SECRET"
0 7 * * *  curl -fsS -X POST https://api.example.com/internal/daily-digest      -H "x-internal-job-secret: $INTERNAL_JOB_SECRET"
```

## 6. Build and distribute apps/mobile

Uses [EAS Build](https://docs.expo.dev/build/introduction/);
`apps/mobile/eas.json` defines `development`/`preview`/`production`
profiles. Before the first real build:

1. `eas login`, then `eas build:configure` from `apps/mobile/` to
   attach the project to your Expo account/project ID (not set in this
   repo — `eas.json`'s profiles are otherwise ready to use).
2. Fill in each profile's `EXPO_PUBLIC_API_URL` with your real
   staging/production API origins (placeholders in the committed file).
3. Add iOS/Android signing credentials — `eas credentials`, or provide
   your own certificates/keystores. Not configured here; this is an
   account-specific step with no reasonable default to commit.
4. `eas build --profile production --platform all`, then
   `eas submit` (App Store Connect / Play Console credentials required,
   same caveat as signing).

Push notifications are out of scope for v1 (`docs/ROADMAP.md`
assumption 8), so no push-credential setup is needed.

## 7. Post-deploy checks

- `curl https://api.example.com/health` returns 200.
- Log in as a seeded (or your first real) user on the deployed web app.
- Confirm the two `/internal/*` endpoints reject requests without the
  correct `x-internal-job-secret` (should 401/403, not silently
  succeed) — this header is the entire authorization model for those
  two routes since they act system-wide with no user session.
- See `docs/BACKUP_RESTORE.md` before this deployment holds any data
  you can't afford to lose.
