# Backup and restore

Two things hold state and must both be backed up: the Postgres
database (everything except file bytes) and the S3-compatible bucket
(photo/document/drawing file bytes — `attachments.storage_key` in
Postgres just points at an object in that bucket). Losing either one
independently leaves the other half-orphaned, so treat them as one
recovery unit, not two.

## What's *not* covered here

Secrets (`JWT_*_SECRET`, `INVITE_TOKEN_SECRET`, `INTERNAL_JOB_SECRET`,
S3/SMTP credentials) live in environment configuration, not the
database — back those up through whatever secret manager holds them,
separately from this runbook.

## Backing up Postgres

Use `pg_dump` in custom format (`-Fc`) — it's compressed, and
`pg_restore` can be pointed at a target that already has some
migrations applied without special flags. Run this against
`DATABASE_URL` (the superuser-equivalent connection), on a schedule
matched to how much data loss is tolerable (daily at minimum; hourly
or continuous WAL archiving if your Postgres provider supports it and
the business can't tolerate losing a day of RFIs/change orders/daily
logs):

```
pg_dump -Fc --no-owner --no-privileges \
  "$DATABASE_URL" \
  -f "siteops-$(date +%Y%m%dT%H%M%S).dump"
```

Store the resulting file somewhere durable and geographically separate
from the primary database (a different region/provider than where
Postgres itself runs) — a backup that lives next to what it's backing
up doesn't survive the failure modes that matter (region outage,
account compromise, accidental cluster deletion).

Retention: keep enough daily dumps to cover your compliance/business
window (30-90 days is a reasonable default for a construction records
system, where "what did the RFI say six weeks ago" is a real
question) plus a handful of monthly snapshots kept longer.

## Backing up the attachment bucket

If using AWS S3 or an S3-compatible provider with versioning and
cross-region replication, enable both — this covers accidental
overwrites/deletes and regional loss with no separate backup job to
maintain. Without that (e.g. self-hosted MinIO), run a periodic sync
to a second bucket/region:

```
mc mirror --overwrite source-minio/siteops-attachments backup-target/siteops-attachments
```

Run the bucket sync and the `pg_dump` on the same schedule, close
together in time. They will never be perfectly atomic with each other
(a photo uploaded between the two snapshots can end up referenced by
the DB dump but missing from the bucket snapshot, or vice versa) —
accepted for the same reason the RLS design accepts non-atomicity
elsewhere in this codebase (see `docs/ARCHITECTURE.md`): closing that
gap needs a transactional outbox or a dedicated backup product, which
is out of scope for v1. What this schedule *does* guarantee is that a
restore is very close to a real point in time, not that it's perfect.

## Restoring

### 1. Restore the database

Point at a fresh, empty Postgres 16 instance (or a wiped existing one
— **never restore over a database with data you still need without a
separate confirmed backup of that data first**):

```
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "$DATABASE_URL" \
  siteops-20260101T030000.dump
```

### 2. Recreate the app role and RLS policies

The dump restores tables and data, including the `__drizzle_migrations`
tracking table — but Postgres *roles* are cluster-level, not
database-level, so a fresh cluster won't have the `siteops_app` login
role the RLS design depends on even after the data is restored. Run
the project's own migration tool against the restored database:

```
DATABASE_URL=<superuser connection to the restored DB> \
  pnpm --filter @siteops/db migrate
```

This is safe and idempotent to run here: Drizzle sees every migration
already recorded in `__drizzle_migrations` and skips re-creating
tables, then unconditionally re-runs
`packages/db/src/sql/001_rls_and_functions.sql`, which recreates
`siteops_app` (only if it doesn't already exist) and re-applies every
RLS policy and helper function fresh. This is the exact same code path
that sets up a brand-new environment — restore uses no separate,
untested procedure.

### 3. Rotate the app role's password

The SQL file creates `siteops_app` with a fixed placeholder password
meant for local dev. On any restore into a cluster where that role
didn't already exist, immediately run:

```sql
ALTER ROLE siteops_app WITH PASSWORD '<a real generated secret>';
```

and update `DATABASE_URL_APP` to match before pointing `apps/api` at
this database.

### 4. Restore the attachment bucket

Point the bucket sync in the other direction, into the bucket
`S3_BUCKET`/`S3_ENDPOINT` now name:

```
mc mirror --overwrite backup-target/siteops-attachments source-minio/siteops-attachments
```

### 5. Verify

- `pnpm --filter @siteops/db exec tsx --env-file=<path to .env> -e "..."` or simply log in as a
  known user on the restored `apps/api` + `apps/web` and confirm their
  projects, RFIs, and punch items are all present and dated correctly.
- Open a photo or document from before the backup window and confirm
  the file loads (not just the DB row) — this is the check that
  catches the DB/bucket time-skew called out above.
- Confirm RLS is actually enforced, not silently bypassed: query as
  `siteops_app` for a project a test user isn't a member of and
  confirm zero rows come back, not an error and not all rows.

## Test restores

A backup that has never been restored is a hope, not a backup. Do a
full restore of the latest dump into a scratch environment on a
recurring schedule (quarterly at minimum) and run the verification
steps above against it — catching a broken backup during a drill costs
nothing; catching it during a real incident costs the business its
data.
