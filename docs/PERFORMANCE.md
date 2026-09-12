# Performance pass (Phase 8)

## Method

`packages/db/src/perf-check.ts` is a standalone, repeatable diagnostic —
not a seed script meant to persist data. Run it with:

```
pnpm --filter @siteops/db exec tsx --env-file=../../.env src/perf-check.ts
```

It runs entirely inside one Postgres transaction that is always rolled
back at the end, so it's safe to run repeatedly against a dev database
with real demo data already in it:

1. Creates 50 synthetic projects and bulk-generates ~160,000 rows across
   `punch_items` (100k), `rfis` (20k), `documents` (20k), and `photos`
   (20k) — spread realistically across the 50 projects rather than
   concentrated in one, so a `project_id` filter is genuinely selective
   (~2% of the table), matching real multi-tenant usage rather than an
   artificially easy or artificially hard case.
2. Runs `ANALYZE` and `EXPLAIN (ANALYZE, BUFFERS)` for the actual
   query shapes used by the services (`punch-item.service.ts`,
   `rfi.service.ts` equivalents, `dashboard.service.ts`,
   `jobs/daily-digest-sweep.ts`) — labeled `AFTER (indexed)`.
3. Drops the five Phase 8 indexes under test (transaction-local),
   re-`ANALYZE`s, and re-runs the identical queries — labeled
   `BEFORE (no index)`, reproducing the pre-migration 0010 baseline.
4. Rolls back. Nothing persists; the migration's real indexes are
   untouched outside the transaction.

## Results

### Project-scoped list queries (the dominant access pattern — nearly
every list/detail endpoint filters by `project_id`)

| Query | Before (seq scan) | After (index) | Speedup | Buffers before → after |
|---|---|---|---|---|
| Punch items by project | 7.18 ms | 0.54 ms | ~13x | 2225 → 51 |
| RFIs by project | 1.53 ms | 0.09 ms | ~17x | 485 → 15 |
| Documents by project | 1.23 ms | 0.07 ms | ~17x | 365 → 10 |
| Photos by project | 1.12 ms | 0.06 ms | ~17x | 267 → 8 |

The buffer-read counts are the more important number: without the index,
every one of these queries touches the *entire table* (Postgres has no
way to skip rows); with the index it touches only the ~2% belonging to
the requested project. This gap widens, not narrows, as the seed grows —
at production scale (many more projects, more rows per project) an
unindexed `project_id` filter degrades to a full-table scan on every
single list request, for every module, on every page load.

### Cross-project daily digest sweep (`jobs/daily-digest-sweep.ts`)

| Query | Before | After | Change |
|---|---|---|---|
| Open punch items, all projects | 31.70 ms | 31.77 ms | none (both Seq Scan) |
| Open RFIs, all projects | 2.75 ms | 2.71 ms | none (both Bitmap Index Scan on the pre-existing `rfis_status_due_date_idx`) |

This is an honest negative result worth recording rather than hiding:
`punch_items_assignee_user_id_idx` does **not** change this query's plan
at the current seed's cardinality. The digest sweep's filter
(`status <> 'closed'`) matches ~75% of all punch items, and with only 12
seeded users the per-user slice behind the index is still large relative
to the table — so the planner correctly prefers one full sequential scan
over 12 separate index probes that would each touch a similar total
number of pages. The index was added for a different, real risk: as the
user base grows into the hundreds while any single user's *open* item
count stays small (the realistic shape — a handful of open items per
person, not thousands), the per-user index probe stays cheap while a full
scan grows linearly with total table size regardless of who's asking.
The index is correct to keep; this benchmark just couldn't reproduce a
win at 12 users, and says so rather than staging a seed shaped to force
one.

## Conclusion

Migration `0010` (`packages/db/src/migrations/0010_ambiguous_baron_strucker.sql`)
turns the project-scoped list query — the single most common query shape
in this codebase — from an O(table size) scan into an O(rows in this
project) index lookup, confirmed under a realistic multi-tenant data
shape. No further schema changes came out of this pass; re-run
`perf-check.ts` if a future phase adds a new hot list/detail query.
