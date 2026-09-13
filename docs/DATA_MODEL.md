# Data Model — SiteOps

Design-level schema, implemented in full in Phase 1 as a 55-table Drizzle
schema (`packages/db/src/schema/`) — see `docs/ROADMAP.md`'s Phase 1 gate
report for what was verified. Column lists here are the fields that matter
for business logic and review, not exhaustive DDL; the Drizzle source is
the authoritative column-level reference now that it exists.

Two auth-infrastructure tables exist in the implementation but weren't
called out in the original design pass: `refresh_tokens` (per-device
refresh token hashes, `docs/ARCHITECTURE.md` §3) and `invites`
(pending email invitations, token hash + expiry). Both are Core/tenancy
tables, unsurprising additions once auth was actually built.

## 0. Cross-cutting columns (every business entity, not repeated per table below)

`id uuid pk`, `project_id uuid fk→projects` (except genuinely global tables:
`companies`, `users`, `user_companies`, `permission_templates`),
`created_by uuid fk→users`, `created_at timestamptz`, `updated_at timestamptz`,
`updated_by uuid fk→users`, `deleted_at timestamptz null` (soft delete),
`server_revision bigint` (monotonic, incremented on every update — used by
numbering locks, sync conflict detection, and optimistic concurrency).

## 1. Core / tenancy

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `companies` | name, type (`gc`/`sub`/`consultant`/`owner`), trade(s) | — | A company can play different roles on different projects |
| `users` | email, password_hash (argon2), name, locale_pref, totp_secret? | — | Global identity; project access via `project_users` |
| `user_companies` | user_id, company_id, title | m:m users↔companies | A user's employer(s) |
| `projects` | name, address, lat/lng (weather lookup), status, locale_default, timezone | — | |
| `project_companies` | project_id, company_id, role_on_project | m:m | e.g. this sub is on this project |
| `project_users` | project_id, user_id, role (enum in §3) | — | Project-level role assignment |
| `permission_templates` | name, module, level (`none/read/standard/admin`) per module | fk from role defaults | Named bundles assignable to a role |
| `project_user_permissions` | project_id, user_id, module, level | overrides template | Per-user, per-project, per-module override |
| `cost_codes` | code, description, wbs_parent_id | self-referential tree | Shared by Budget/Commitments/Change/Billing |
| `locations` | project_id, parent_id, level_type (`building/level/zone/room`), name | self-referential tree | Used by Punch Items, Daily Log, Inspections |
| `trades` | name | — | Referenced by manpower, punch items, submittals |
| `specifications_sections` | csi_code, title | — | Referenced by Submittals |
| `attachments` | owner_type, owner_id (polymorphic), storage_key, filename, mime, size, uploaded_by | polymorphic | Backing store for every file across modules |
| `audit_log` | actor_id, entity_type, entity_id, action, before jsonb, after jsonb, ip, created_at | — | **Insert-only.** No update/delete grant at the DB role level. |
| `notifications` | user_id, type, payload jsonb, read_at | — | In-app + source for email digests |
| `number_sequences` | project_id, sequence_key (e.g. `RFI`, `SUB.03.30.00`, `CO`), next_value | — | Row-locked by the numbering function (§ ARCHITECTURE.md §7) |
| `record_links` | source_type, source_id, target_type, target_id | polymorphic, both directions queryable | e.g. RFI↔Drawing, Punch Item↔Inspection |

## 2. T1 — Documents & Drawings

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `document_folders` | project_id, parent_id, name | self-referential tree | |
| `documents` | folder_id, title, current_attachment_id | → attachments | Non-drawing files (specs, contracts, etc.) |
| `drawings` | project_id, sheet_number, discipline, title, current_revision_id | — | The register row; "latest" is a pointer |
| `drawing_revisions` | drawing_id, revision_code, attachment_id, issued_date, superseded_at | fk drawings | Full history retained; `drawings.current_revision_id` is latest-wins |
| `markups` | drawing_revision_id, created_by, x/y (or polygon) coords, note, linked record_link | anchors to sheet coordinates | Pins persist per-revision, not re-projected across revisions automatically |

## 3. T1 — RFIs

Ball-in-court is a **computed, indexed** column (not just derived at query
time) — recalculated on every state transition so "what's on me today"
queries hit an index rather than joining/deriving per request.

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `rfis` | number (via number_sequences), subject, question, status (`draft/open/answered/closed`), ball_in_court_user_id, ball_in_court_company_id, due_date, cost_impact_flag, schedule_impact_flag | record_links → drawings/specs | Overdue = status in (open) and due_date < now, indexed |
| `rfi_responses` | rfi_id, responded_by, response_text, is_official | fk rfis | Multiple responses; one marked official |
| `rfi_distribution` | rfi_id, user_id or company_id | fk rfis | cc list, drives `subcontractor` visibility rule |

## 4. T1 — Submittals

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `submittals` | number (per spec section), spec_section_id, title, status, ball_in_court_user_id, lead_time_days, required_on_site_date | fk specifications_sections | |
| `submittal_packages` | submittal_id, package_number | groups revisions | |
| `submittal_revisions` | package_id, revision_number, attachment_id, submitted_date | fk submittal_packages | |
| `submittal_reviews` | revision_id, reviewer_user_id, sequence_order, is_parallel, response_code (`approved/approved_as_noted/revise_resubmit/rejected`), reviewed_at | fk submittal_revisions | Sequential reviewers block on order; parallel reviewers don't |

## 5. T1 — Daily Log

One `daily_logs` row per project per calendar day (unique constraint on
`project_id, log_date`); child tables fan out.

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `daily_logs` | project_id, log_date (unique w/ project_id), weather_json (auto-fetched, overridable), notes, locked_at, signed_by | — | `locked_at` set on submit; further edits require explicit reopen (audited) |
| `daily_log_manpower` | daily_log_id, company_id, trade_id, headcount, hours | fk daily_logs | |
| `daily_log_equipment` | daily_log_id, equipment_desc, company_id, hours | fk daily_logs | |
| `daily_log_deliveries` | daily_log_id, description, received_by | fk daily_logs | Also covers visitors (type discriminator) |
| `daily_log_delays` | daily_log_id, cause_code, description, hours_impact | fk daily_logs | |

T1 resolved the open question below as a structured-but-minimal
`daily_log_safety_incidents` sub-record from the start (not free text).
The T3 Safety module (§9b, Phase 9) added its own independent
`safety_incidents` table rather than promoting/migrating this one -- see
the Phase 9 gate report for why the two lists stay separate in v1.

## 6. T1 — Punch List / Snags

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `punch_items` | number, location_id, assignee_user_id, assignee_company_id, trade_id, priority, due_date, status (`open/ready_for_review/approved/closed`), drawing_revision_id, markup_id? | fk locations, drawings | |
| `punch_item_history` | punch_item_id, from_status, to_status, changed_by, note | fk punch_items | Append-only status trail, feeds overdue report |

## 7. T1 — Photos

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `photo_albums` | project_id, name | — | |
| `photos` | album_id, attachment_id, taken_at (EXIF), gps_lat, gps_lng, tags text[] | record_links → any entity | Linkable from RFIs, punch items, daily logs, inspections |

## 8. T1 — Inspections & Checklists

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `checklist_templates` | project_id (or global), title | — | |
| `checklist_template_items` | template_id, prompt, response_type (`pass_fail/na/numeric/photo/signature`), order | fk checklist_templates | |
| `inspections` | template_id, project_id, location_id, scheduled_at, performed_by, status, signature_attachment_id | fk checklist_templates | |
| `inspection_responses` | inspection_id, template_item_id, value jsonb, photo_attachment_id, generated_punch_item_id? | fk inspections | A failed pass/fail item auto-creates a `punch_items` row, linked back here |

## 9. T2 — Financial & Commercial

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `budget_line_items` | project_id, cost_code_id, original_amount, approved_changes_amount (derived), projected_amount, forecast_to_complete | fk cost_codes | CSV import target |
| `commitments` | project_id, company_id, type (`subcontract/po`), cost_code_id, retention_pct | fk cost_codes, companies | |
| `commitment_line_items` | commitment_id, cost_code_id, schedule_of_values_amount | fk commitments | |
| `change_events` | project_id, title, description, potential_cost_impact | — | Upstream of PCOs |
| `potential_change_orders` | change_event_id, cost_impact, time_impact_days, status | fk change_events | |
| `change_orders` | pco_id?, target_type (`prime/commitment`), target_id, cost_impact, time_impact_days, approval_chain jsonb, status | polymorphic target | Threshold logic (2nd approver from different company/role) enforced in `packages/shared`, evaluated server-side on approve transition |
| `payment_applications` | commitment_id or prime, period_start, period_end, retention_pct, status | fk commitments | |
| `payment_application_lines` | payment_application_id, sov_line_id, pct_complete_previous, pct_complete_this_period | fk payment_applications | Previous/this-period/to-date computed, not stored redundantly where derivable |
| `meetings` | project_id, title, occurred_at, attendees jsonb | — | |
| `meeting_items` | meeting_id, description, owner_user_id, status, carried_forward_from_item_id?, converted_to_type/id? | fk meetings | Self-link for carry-forward; polymorphic convert-to-task/RFI |

## 9a. T3 — Schedule (Phase 9)

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `schedule_tasks` | project_id, name, start_date, end_date, percent_complete, status (`not_started/in_progress/complete/delayed`), assigned_company_id, sort_order | fk companies | Flat task list, deliberately no predecessor/successor dependency graph or critical-path engine -- see Phase 9 gate report |

## 9b. T3 — Safety (Phase 9)

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `safety_incidents` | project_id, occurred_at, location_id, severity (`near_miss/minor/serious/critical`), description, involved_company_id, injured_person_name?, status (`open/investigating/closed`), corrective_action?, reported_by, closed_by?, closed_at? | fk locations, companies | Independent of `daily_log_safety_incidents` (T1's lightweight quick-capture) -- the two lists are not unified in v1 |
| `safety_observations` | project_id, observed_at, location_id, category (`unsafe_condition/unsafe_act/near_miss/good_catch`), description, status (`open/resolved`), reported_by, resolved_by?, resolved_at? | fk locations | Lighter than an incident: no investigation/corrective-action workflow |

## 9c. T3 — T&M Tickets (Phase 10)

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `tm_tickets` | project_id, ticket_number, company_id, work_date, description, status (`draft/submitted/approved/rejected`), submitted_by?, submitted_at?, approved_by?, approved_at?, rejection_reason? | fk companies | `company_id` is the sub billing the ticket -- a subcontractor is RLS-restricted to only their own company's tickets (`tm_tickets_subcontractor_scope`), unlike RFIs' project-wide visibility |
| `tm_ticket_labor_entries` | ticket_id, worker_name, trade?, hours, rate | fk tm_tickets | |
| `tm_ticket_equipment_entries` | ticket_id, description, hours, rate | fk tm_tickets | |
| `tm_ticket_material_entries` | ticket_id, description, quantity, unit, unit_cost | fk tm_tickets | `totalAmount` (sum of all three entry types × rate/cost) is computed by the service layer, never stored redundantly |

## 9d. T3 — Correspondence (Phase 10)

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `correspondence` | project_id, correspondence_number, direction (`incoming/outgoing`), type (`letter/notice/transmittal/memo`), subject, body, from_company_id, to_company_id, sent_date?, response_required_by?, status (`draft/sent/acknowledged/closed`), acknowledged_by?, acknowledged_at?, closed_by?, closed_at? | fk companies (x2) | A subcontractor is RLS-restricted to correspondence where their own company is sender or recipient (`correspondence_subcontractor_scope`), mirroring the RFI ball-in-court/distribution rule adapted to a from/to shape |

## 9e. Scheduling & Gantt (Addendum A, Phase 11a)

Full spec: `docs/SCHEDULING.md`. Tier A (import + visualise) only --
Tier B (native CPM editing, Phase 11d) is a later, feature-flagged phase.
Deliberately built last per explicit instruction, after every other
planned phase -- see `docs/ROADMAP.md`'s Phase plan.

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `schedules` | project_id, source_tool, default_calendar_id?, current_version_id? | fk projects | One per project. `current_version_id` has no DB-level FK (would be circular with `schedule_versions.schedule_id`) -- kept consistent at the service layer only |
| `schedule_versions` | schedule_id, version_no, data_date, is_baseline, baseline_label?, imported_from, imported_by, source_file_attachment_id?, notes? | fk schedules, fk attachments | Immutable once superseded -- a re-import always creates a new version, never overwrites (docs/SCHEDULING.md A2) |
| `schedule_tasks` | version_id, external_id?, wbs_code?, parent_task_id? (self-ref), name, task_type (`task/summary/milestone/loe/wbs`), duration_minutes?, calendar_id?, early/late/planned/actual start+finish, total_float_minutes?, free_float_minutes?, is_critical, percent_complete, physical_percent_complete?, constraint_type?, constraint_date?, responsible_company_id?, trade_id?, location_id?, cost_code_id?, sort_order | fk schedule_versions, fk calendars, fk companies/trades/locations/cost_codes | **Not the same table as Phase 9's flat-list Schedule module** -- that table was renamed to `manual_schedule_tasks` (migration 0014) to free this name for the versioned CPM model. `external_id` (then `wbs_code`, then an exact name match) is what a re-import diff matches a task against across versions (docs/SCHEDULING.md A2) |
| `task_dependencies` | predecessor_id, successor_id, type (`FS/SS/FF/SF`), lag_minutes | fk schedule_tasks (x2) | Unique on (predecessor, successor, type); cycle-checked by the importer before any row is written, not by a DB constraint |
| `calendars` | project_id, name, is_default, hours_per_day, working_days (bitmask, bit 0 = Sunday) | fk projects | Defaults to Sun-Thu working (`0b0011111` = 31), not Mon-Fri (docs/SCHEDULING.md A10) |
| `calendar_exceptions` | calendar_id, date, is_working, working_minutes?, label? | fk calendars | Not yet populated by any importer in this phase -- see the scope-cut note below |
| `task_baseline_values` | task_id, baseline_version_id, planned_start?, planned_finish?, duration_minutes? | fk schedule_tasks, fk schedule_versions | A variance snapshot; not written by anything yet in Phase 11a (no baseline-comparison feature built this phase) |
| `lookahead_plans` | project_id, week_start, horizon_weeks, published_at?, published_by? | fk projects | Schema only -- the look-ahead generator itself is Phase 11c |
| `lookahead_commitments` | lookahead_plan_id, task_id, promised_finish, committed_by_company_id, actual_finish?, reason_code? | fk lookahead_plans, fk schedule_tasks | Schema only, same as above |

**Importers built this phase** (`packages/shared/src/schedule/importers/`):
MS Project XML, Primavera P6 XER, Primavera P6 XML (all three real
formats, field names reconstructed from memory -- validate against a
real export file if a specific field turns out different), and CSV
(the tabular fallback; XLSX binary decoding to the same row shape is
deferred to whichever phase builds the upload UI, since it needs a
library dependency that belongs at the API layer, not in the
browser-shared `packages/shared` bundle). Every importer normalises to
one `ParsedSchedule` shape and runs the same validation (circular
dependency, orphaned predecessor, negative duration).

**Scope cuts, documented rather than silently incomplete:**
- `clndr_data`/`<StandardWorkWeek>` (P6's own per-calendar working-day
  encoding) is not parsed -- every imported calendar defaults to Sun-Thu
  working hours. `calendar_exceptions` stays empty until a later phase
  parses that data.
- Import runs synchronously, not as a background job with progress
  feedback (docs/SCHEDULING.md A2's 5,000-task/10s target implies one)
  -- at this phase's ~1,000-task gate scale it comfortably clears 10
  seconds in practice; a background-job version is a reasonable follow-up
  once real usage approaches thousands of tasks.
- `record_links` (generic polymorphic source/target linking, existing
  since Phase 1 but never wired to any API until now) gained its first
  real usage here: creating/listing links, and a re-import carrying
  forward any link pointing at a matched task's previous-version row
  onto its new row, so "an RFI linked to this activity" survives a
  re-import rather than dangling on a superseded row id. `record_links`
  still has no RLS (a pre-existing Phase 1 open item, not something this
  phase attempted to fix) -- authorization for it lives in
  `record-links.service.ts` instead, keyed off which module a given
  source/target type belongs to.
- No web or mobile UI this phase -- the Gantt UI (including any import
  form) is explicitly Phase 11b in the addendum's own phase breakdown.

## 10. Row-Level Security approach (implemented — `packages/db/src/sql/001_rls_and_functions.sql`)

Every tenant-scoped table with a direct `project_id` column gets an RLS
policy of the shape:

```sql
USING (project_id IN (
  SELECT project_id FROM project_users WHERE user_id = current_setting('app.user_id', true)::uuid
))
```

Child tables without their own `project_id` (e.g. `drawing_revisions`,
`rfi_responses`, `daily_log_manpower`) are scoped via their parent instead:
`USING (parent_fk IN (SELECT id FROM parent_table))` — since the subquery
against the parent table runs under the same RLS-restricted role, the
parent's own policy filters it automatically; one line per child table
rather than re-deriving the project-membership predicate everywhere.

**Self-referencing policy hazard (found and fixed during Phase 1)**: a
table whose own policy needs to query itself — `project_users` checking
"is the caller a member of this project?", which requires querying
`project_users` — cannot do so with a plain subquery: Postgres raises
"infinite recursion detected in policy" (42P17), since evaluating the
policy re-triggers the same policy on the subquery, forever. The fix is a
`SECURITY DEFINER` helper function (`is_project_member(project_id)`, and
the equivalent `is_company_visible(company_id)` for the `companies` ↔
`user_companies` mutual reference), which runs with the privileges of its
superuser owner and so bypasses RLS internally, breaking the cycle. Any
future table whose policy needs to query itself (or two tables whose
policies query each other) needs the same treatment.

Two hard rules from the brief, both enforced at RLS *and* the permission
engine (`packages/shared`) as defense-in-depth:

- **Subcontractor scoping**: `subcontractorCanSeeRecord()` in
  `packages/shared/src/permissions/engine.ts` is unit-tested; the
  corresponding per-module RLS branches (RFIs via `rfi_distribution`,
  Punch Items via `assignee_company_id`, etc.) land with each module in
  its own phase — Phase 1 didn't build RFIs/Punch Items yet, so this is
  implemented and tested at the engine level now, RLS-enforced per table
  as each module ships.
- **Client financial exclusion**: `client_viewer` is denied via a
  `RESTRICTIVE` policy on every T2 financial table
  (`current_setting('app.role', true) IS DISTINCT FROM 'client_viewer'`,
  which Postgres ANDs against the permissive membership policy) *and*
  forced to `"none"` in `resolveEffectiveLevel()` regardless of what a
  template/override says — both layers tested.

`app.user_id` / `app.role` are set via `SELECT set_config(..., true)`
(transaction-local) at the start of each API transaction
(`withRequestContext` in `packages/db/src/request-context.ts`), derived
from the verified JWT — never trusted from a client-supplied header. Two
narrow exceptions run on a separate, RLS-bypassing superuser connection
instead, because they have no tenant context to scope by yet: login-by-
email, invite-token lookup, and refresh-token lookup (see
`apps/api/src/db.ts`) — each has its own strong check (password verify,
token expiry/hash match) standing in for RLS at that moment.

**Open**: `record_links` (polymorphic) has no RLS policy yet — scoping it
generically would need a per-source/target-type join; left to the
application layer until enough polymorphic-link consumers exist to justify
the SQL (tracked in §13).

## 11. Full-text search

`tsvector` generated columns (Postgres `GENERATED ALWAYS AS ... STORED`) on
`documents`, `rfis` (subject+question), `submittals` (title), `punch_items`
(description/location), and `daily_logs` (notes), each with a GIN index,
combined behind one per-project search endpoint that unions ranked results
per type.

## 12. Numbering formats

| Sequence key | Format | Scope |
|---|---|---|
| RFI | `RFI-0042` | per project |
| Submittal | `SUB-03.30.00-002` | per project + spec section |
| Change Order | `CO-007` | per project |
| Punch Item | `PI-0123` | per project |
| Drawing revision | free-text (owner-supplied, e.g. `A`, `1`, `Rev-2`) | not sequence-generated — revision codes are often contractually specified upstream, not ours to assign |

## 13. Open items carried forward from Phase 1

- `record_links` has no RLS policy yet (§10) — add one per polymorphic
  type pair as modules that use it (Photos↔RFIs, Punch Items↔Inspections,
  etc.) actually ship, rather than guessing the shape now.
- Subcontractor-scoping RLS branches per module (RFIs, Submittals, Punch
  Items, Daily Log) land alongside each module's own phase — the rule
  itself is implemented and tested at the permission-engine level today.
- `permission_templates` default rows exist for all 10 roles
  (`packages/shared/src/permissions/default-templates.ts`, seeded by
  `packages/db/src/seed.ts`) but are a first draft, not a reviewed matrix —
  revisit per-role defaults as real usage surfaces gaps, especially once
  T2 financial modules (Phase 6) are live.
- Confirm Hijri-calendar display is out of scope for v1 (Gregorian +
  `ar-JO` number formatting only) — see Assumptions.
- ~~Decide whether the minimal structured `daily_log_safety_incidents`
  table (already implemented per Assumption #9) is the right shape ahead
  of the full T3 Safety module, or should be simplified back to free
  text.~~ Resolved in Phase 9: kept as-is (Daily Log's own lightweight
  capture), and the full Safety module (§9b) got its own independent
  `safety_incidents` table rather than promoting this one.
