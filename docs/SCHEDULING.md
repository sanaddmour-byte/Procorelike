# Scheduling & Gantt Module — Addendum A

> This is the authoritative spec for the Scheduling & Gantt module, appended to
> the project's build plan after Phase 9 shipped. It **replaces Module 14
> (Schedule)** in `docs/ROADMAP.md`'s module tiers table and **promotes it from
> T3 to T2**. Everything in `CLAUDE.md` (operating rules, stack, anti-patterns)
> still applies unchanged. Build order and gates live in `docs/ROADMAP.md`'s
> Phase plan as the final phase, Phase 11a–11d (deliberately built last,
> after every other planned phase -- explicit instruction when this
> addendum was received); this file holds the detailed "what" and "how".
> §A9 below preserves the addendum's original suggested phase numbering
> for reference; the decided actual position is Phase 11a-11d.

## A0. Scope decision — read this first

MS Project is two products fused together: a **CPM scheduling engine** and a
**Gantt editor**. Cloning both is comparable in effort to the entire T1 module
set. Build in three tiers and stop where the value runs out.

| Tier | What it is | Why it matters |
|------|-----------|----------------|
| **A — Import & Visualise** | Ingest a schedule produced in MS Project or Primavera P6. Read-only Gantt, critical path display, look-ahead filters, link tasks to RFIs/submittals/punch items. No editing of logic. | Covers the majority of real contractor usage. The planner owns the master schedule in P6/MSP; everyone else needs to *see* it and connect field records to it. |
| **B — Native CPM Engine** | Create and edit tasks and logic in-app. Full forward/backward pass, float, constraints, calendars, progress updating, baselines and variance. | Needed only if you intend to replace the planning tool, not sit alongside it. |
| **C — Resources & Earned Value** | Resource assignment, histograms, levelling, cost loading, earned-value (BCWS/BCWP/ACWP, SPI/CPI). | Highest effort, lowest adoption. Build only on confirmed demand. |

**Default instruction: build Tier A fully and Tier B's engine behind a feature
flag. Do not start Tier C without explicit approval.**

## A1. The `.mpp` constraint (do not ignore this)

`.mpp` is a closed binary format. There is **no reliable pure-JavaScript/
TypeScript parser**. Do not attempt to write one, and do not claim `.mpp`
support that isn't actually deliverable.

Supported import paths, in order of preference:

1. **MS Project XML** (`.xml`, saved from MS Project) — parse natively in
   TypeScript. This is the primary path. **Required.**
2. **Primavera P6 XER and P6 XML** — parse natively in TypeScript.
   **Required** — P6 dominates infrastructure and large-contractor work in
   this region.
3. **CSV/XLSX task list** with a guided column-mapping UI. **Required** — the
   fallback for everyone who plans in Excel.
4. **`.mpp` binary** — only via an **MPXJ sidecar service** (Java) exposed
   over HTTP inside the compose stack, converting `.mpp` → normalised JSON.
   Put it in `services/schedule-parser/`. **Build this last, behind a feature
   flag**, and if the sidecar is not running, the UI must tell the user to
   export as XML rather than fail silently.

Every importer normalises to one internal `ParsedSchedule` shape defined in
`packages/shared/src/schedule/types.ts`. Importers are pure functions with
fixture-based unit tests — commit at least one real-world sample file per
format under `packages/shared/fixtures/schedules/`.

## A2. Import behaviour

- Import creates a new **schedule version** (never overwrites). Versions are
  immutable once a newer one exists.
- On re-import, run a **diff against the previous version** matched on
  external task ID, then on WBS code, then on fuzzy name match. Show the
  user before committing: added / removed / re-dated / re-logicked /
  progress-changed, with day deltas.
- Preserve every external identifier (`external_id`, `wbs_code`,
  `activity_id`) so links from RFIs and punch items survive re-import. **A
  re-import that breaks existing links is a failed import** — write a test
  for this.
- Capture the **data date / status date** from the source file. All progress
  logic keys off it.
- Reject and report clearly: circular dependencies, tasks outside the
  project calendar, orphaned predecessors, negative durations.
- Import must handle a 5,000-task file in under 10 seconds, processed in a
  background job with progress feedback — never a blocking request.

## A3. Data model additions

- `schedules` — one per project; holds current version pointer, source
  tool, default calendar.
- `schedule_versions` — `version_no`, `data_date`, `is_baseline`,
  `baseline_label`, `imported_from`, `imported_by`,
  `source_file_attachment_id`, `notes`.
- `schedule_tasks` — `version_id`, `external_id`, `wbs_code`,
  `parent_task_id` (self-ref, for summary tasks), `name`, `task_type`
  (task | summary | milestone | loe | wbs), `duration_minutes`,
  `calendar_id`, `early_start`, `early_finish`, `late_start`, `late_finish`,
  `planned_start`, `planned_finish`, `actual_start`, `actual_finish`,
  `total_float_minutes`, `free_float_minutes`, `is_critical`,
  `percent_complete`, `physical_percent_complete`, `constraint_type`,
  `constraint_date`, `responsible_company_id`, `trade_id`, `location_id`,
  `cost_code_id`, `sort_order`.
- `task_dependencies` — `predecessor_id`, `successor_id`, `type`
  (`FS|SS|FF|SF`), `lag_minutes`. Unique on (predecessor, successor, type).
  Cycle-checked on write.
- `calendars` — `name`, `is_default`, `hours_per_day`, `working_days`
  (bitmask Sun–Sat — **default to a Sunday–Thursday working week for
  ar-JO, not Mon–Fri**).
- `calendar_exceptions` — `calendar_id`, `date`, `is_working`,
  `working_minutes`, `label` (Eid, Friday, site shutdown, rain day).
- `task_baseline_values` — snapshot of dates/duration per task per
  baseline, for variance.
- `lookahead_plans` — `week_start`, `horizon_weeks`, `published_at`,
  `published_by`.
- `lookahead_commitments` — task_id, promised_finish,
  committed_by_company_id, actual_finish, `reason_code` for misses
  (Last Planner-style PPC tracking).
- Extend `record_links` so RFIs, submittals, punch items, daily logs,
  change orders and commitments can all target a `schedule_task`.

**Naming note (for whoever starts Phase 11a):** Phase 9 already shipped a
table literally named `schedule_tasks` (a flat list with no version
concept). Since this addendum's `schedule_tasks` is a fundamentally
different, versioned shape, Phase 11a will need to rename the Phase 9
table at the SQL level (e.g. to `manual_schedule_tasks`, via a
hand-written `ALTER TABLE ... RENAME` migration, not a drop/recreate — no
data should be lost) to free up the name, before the new comprehensive
`schedule_tasks` table can be created. This addendum is deliberately
built **last** (see `docs/ROADMAP.md`'s Phase plan, Phase 11a-11d), so
this rename has not happened yet — the Phase 9 API/web/mobile code is
untouched and still live under the original `schedule_tasks` name.

## A4. CPM engine (Tier B) — specification

Implement in `packages/shared/src/schedule/cpm.ts` as a **pure,
deterministic function**:

```ts
computeSchedule(input: {
  tasks: CpmTask[];
  dependencies: CpmDependency[];
  calendars: Calendar[];
  dataDate: Date;
  options: { retainedLogic: boolean; ignoreConstraintsOnCritical: boolean };
}): CpmResult
```

No database access, no I/O, no `Date.now()`. It must be re-runnable and
produce identical output for identical input — this is what makes it
testable.

**Required behaviour:**

1. **Topological sort** with explicit cycle detection; on a cycle, return
   the participating task chain, do not throw a generic error.
2. **Forward pass** → early start / early finish. **Backward pass** → late
   start / late finish. **Total float** = LS − ES. **Free float** =
   earliest successor ES − EF.
3. **All four relationship types** with positive and negative lag. Lag is
   calendar-aware, using the successor's calendar.
4. **Constraint types**: ASAP, ALAP, Start No Earlier Than, Start No Later
   Than, Finish No Earlier Than, Finish No Later Than, Must Start On, Must
   Finish On. Constraint violations produce a warning list, not a silent
   date change.
5. **Calendar-aware date arithmetic** — all duration maths in working time,
   per-task calendar, honouring exceptions. Never add raw 24-hour days.
   Extracted into `workingTimeAdd()` / `workingTimeBetween()`
   (`packages/shared/src/schedule/calendar.ts`) with their own exhaustive
   test suite; this is the single most common source of off-by-one-day
   bugs.
6. **Progress and the data date**: completed work is pushed behind the data
   date, remaining work in front of it. Support both **retained logic** and
   **progress override**.
7. **Critical path** = total float ≤ 0 (threshold configurable; longest-path
   mode optional).
8. **Summary/WBS roll-up**: dates and % complete roll up from children;
   summary tasks are never directly scheduled.
9. **Milestones** have zero duration and are start- or finish-flagged.

**Testing bar:** a golden-file test suite of at least 25 scenarios, each
with hand-computed expected dates and floats — including negative lag, SS
with lag, a non-working-week calendar, an Eid shutdown exception, an
out-of-sequence progress case, and a 2,000-task performance case that must
compute in under 500ms.

## A5. The Gantt UI

### Rendering
- **Do not render one DOM node per bar.** Target: 5,000 tasks, 60fps pan
  and zoom.
- Left pane: virtualised task grid (react-window), resizable/reorderable/
  pinnable columns, indent-collapsible WBS tree, inline editing (Tier B
  only).
- Right pane: **canvas-rendered** timeline with an absolutely-positioned
  React overlay for hit targets, tooltips and selected-bar handles. Shared
  vertical scroll, synchronised virtualisation, independent horizontal
  scroll.
- If a commercial component library is proposed instead (Bryntum, DHTMLX,
  Syncfusion), **stop and ask first** — state the licence cost, the
  bundle-size impact, and whether it supports RTL. Do not add it
  unilaterally.

### Required features
- Zoom presets: day / week / month / quarter / year, with the timescale
  header adapting.
- Critical path highlighting; toggle float bars; toggle baseline bars
  (rendered as a thinner bar beneath actual).
- Dependency arrows with proper orthogonal routing — no arrows crossing
  through bars.
- Progress fill inside the bar; a distinct data-date line; today line.
- Bar labels: configurable (name, dates, % complete, responsible company).
- Colour-by: critical / trade / company / location / status / float band.
- Filters: date window, WBS branch, company, trade, location, status,
  critical-only, has-open-RFI. Saved as named views, shareable per project.
- Grouping and sorting by any grid column.
- Click a bar → side panel with task detail, linked records, and "raise
  RFI / create punch item against this activity".
- Drag to reschedule, drag endpoints to change duration, drag between bars
  to create a dependency — **Tier B only**, with an undo stack and a
  "recalculate" preview showing the downstream impact before commit.
- **Export**: PDF (paginated, plotted at A1/A3 with a title block), PNG,
  XLSX task list, and MS Project XML / P6 XML round-trip export.
- **Print/plot layout** must be usable — construction schedules get pinned
  to site office walls.

### Arabic / RTL
- The timeline runs **left-to-right regardless of UI direction** —
  reversing a Gantt timeline is wrong and confuses every planner who sees
  it. Mirror the *layout* (grid on the right, timeline on the left), not
  the time axis.
- Arabic task names, Hijri date display as a secondary line option, `ar-JO`
  date formatting.

## A6. Look-ahead & field use (the part that drives adoption)

A Gantt alone gets opened twice a month. The look-ahead is what gets used
weekly.

- **3/6-week look-ahead generator**: filter to tasks in the window, group
  by company/trade/location, output as a grid, a PDF, and a shareable link.
- **Constraint/commitment log**: for each look-ahead task, record readiness
  constraints (design, material, permit, access, labour, prerequisite
  work) with owner and need-by date.
- **PPC tracking (Last Planner)**: subcontractors commit to a finish date;
  record actual; compute Percent Plan Complete per company per week, with
  reason codes for misses and a trend chart. This is the single
  highest-value analytic in the module.
- **Progress capture from the field**: superintendent updates % complete
  or actual dates from the mobile app, offline-capable, queued through the
  existing sync outbox. Field updates land as **pending progress**
  requiring planner acceptance — never let a phone edit silently mutate
  the master schedule.
- **Delay linkage**: a daily-log delay entry can be attached to a schedule
  task and feeds a delay register with cumulative impact days — this is
  what claims are built on.

## A7. Mobile

**Do not build a pinch-zoom Gantt on a phone.** It is unusable and nobody
asks for it twice.

Mobile ships instead:
- "My tasks this week / next 3 weeks" — a filtered list by company and
  trade.
- Task detail with linked RFIs, submittals, punch items, drawings.
- Progress update (% or actual start/finish) with a photo and note,
  offline-queued.
- Commitment confirm/decline for look-ahead items.
- A read-only, horizontally-scrolling **tablet** Gantt is acceptable in a
  later phase.

## A8. Analytics to expose

- Schedule variance vs baseline: days ahead/behind at project and WBS
  level.
- Critical path length and its change between versions.
- Float erosion trend — near-critical tasks (float 0–10 days) growing over
  time.
- Activities started late / finished late, by responsible company.
- PPC by company by week.
- Open RFIs and submittals sitting on critical-path activities — **this is
  the report a project director will actually open**. Build it early.

## A9. Phase insertion

The addendum as originally received proposed inserting this as **Phase
6.5**, right after Financials (Phase 6). **Decided instead (explicit
instruction): build it last**, as Phase 11a-11d in `docs/ROADMAP.md`'s
Phase plan, after Phase 10 (T&M Tickets & Correspondence) and anything
else planned. The sub-phase breakdown and gates are otherwise unchanged
from the original proposal:

- **11a** (originally proposed as 6.5a) — Data model, calendars,
  importers (MSP XML, P6 XER/XML, CSV), version diffing, linkage to
  existing records. *Gate: import a real 1,000+ task P6 file, re-import a
  revised version, prove existing RFI links survive.*
- **11b** (originally 6.5b) — Read-only Gantt UI: virtualised grid +
  canvas timeline, filters, saved views, critical path, baselines,
  PDF/plot export. *Gate: 5,000 tasks pan and zoom smoothly; plotted PDF
  is legible at A1.*
- **11c** (originally 6.5c) — Look-ahead, constraint log, PPC, mobile
  progress capture with planner acceptance queue. *Gate: full offline
  field-update round trip.*
- **11d** (originally 6.5d) — CPM engine behind a feature flag, in-app
  editing, drag-reschedule with impact preview, XML export. *Gate: the
  25-scenario golden-file suite passes and the 2,000-task computation
  stays under 500ms.* **Built — see docs/ROADMAP.md's Phase 11d gate
  report** (35 golden-file scenarios, feature-flagged in-app editing with
  drag-reschedule/resize/link, impact preview before commit, undo, and
  MS Project XML export; PDF/XLSX export and the `.mpp` sidecar remain
  the documented gap from A1/the Phase 11b gate report).

Tier C (resources, levelling, earned value) is **not scheduled**. Do not
build it.

## A10. Anti-patterns specific to this module

- Do not write a CPM engine that touches the database. Pure function,
  always.
- Do not do date arithmetic in calendar days anywhere in this module.
- Do not default to a Monday–Friday week.
- Do not let a mobile progress edit write directly to the published
  schedule.
- Do not overwrite a schedule on re-import.
- Do not render the timeline right-to-left in Arabic mode.
- Do not claim `.mpp` support without the MPXJ sidecar actually running.
- Do not ship a Gantt that degrades below 2,000 tasks — real
  infrastructure schedules routinely exceed 10,000 activities.
