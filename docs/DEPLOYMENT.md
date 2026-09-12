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
