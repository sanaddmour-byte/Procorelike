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
| `notifications` | user_id, type, payload jsonb, read_at | — | In-app (Phase 16: RFI/Submittal/Punch Item/Change Order key events); `user_id` is the *recipient*, so INSERT is gated only on "authenticated session" while SELECT/UPDATE stay recipient-scoped (see `001_rls_and_functions.sql`) |
| `number_sequences` | project_id, sequence_key (e.g. `RFI`, `SUB.03.30.00`, `CO`), next_value | — | Row-locked by the numbering function (§ ARCHITECTURE.md §7) |
| `record_links` | source_type, source_id, target_type, target_id | polymorphic, both directions queryable | e.g. RFI↔Drawing, Punch Item↔Inspection |
| `custom_field_definitions` | project_id, module (permission_module enum), label, field_type (text/number/date/boolean/select), options jsonb, required, sort_order | fk projects | Admin-defined extra fields per project+module; `directory:admin` gated writes |
| `custom_field_values` | definition_id, entity_id (polymorphic), value jsonb | fk custom_field_definitions, cascade delete; unique (definition_id, entity_id) | Value type validated server-side against the live definition's field_type/options |
| `workflow_transition_rules` | project_id, module (permission_module enum), from_status, to_status, enabled (default true), required_level (permission_level enum, default standard) | fk projects; unique (project_id, module, from_status, to_status) | Phase 16: narrows -- never widens -- a module's hardcoded status-transition table. Pilot modules only (`rfis`, `punch_list`); no row for a tuple means the module's default applies |

`projects` gained a `default_currency` (ISO 4217, default `USD`) column — the fallback currency for financial records that don't carry their own `currency` column (direct costs, change orders, payment applications). `budget_line_items`, `prime_contracts`, and `commitments` already had their own per-row `currency` column from earlier phases; both are now actually rendered (via `packages/shared`'s `formatMoney`) instead of every financial page silently stripping the currency and showing a bare number. `PATCH /projects/:id/settings` (directory:admin gated) is the first write path for `default_currency`/`change_order_threshold`/`timezone` past project creation.

`audit_log` has no `project_id` (see its row above) — `GET /projects/:id/history?entityType=&entityId=` (packages: `entity-history.service.ts`) resolves project-scoping by reading the entity through its own RLS-protected table first (currently wired for `rfi` and `punch_item`; extend `HISTORY_ENTITY_TYPES` for more), rather than denormalizing `project_id` onto audit_log's ~100 existing `writeAuditLog` call sites.

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

## 9f. Scheduling & Gantt UI (Addendum A, Phase 11b)

No schema changes this phase (one new read endpoint, `GET
/schedules/current`, reusing 9e's tables as-is). Full detail in
`docs/ROADMAP.md`'s Phase 11b gate report; summarised here for the
data-model-adjacent parts:

- **Two scale bugs in the 9e data layer, found by this phase's
  5,000-task verification and fixed here**: the importer's cycle
  detection (`findCycle()` in `packages/shared/src/schedule/validate.ts`)
  was recursive and overflowed the call stack on a long unbroken
  dependency chain -- rewritten iteratively. The bulk task/dependency
  `INSERT`s in `importSchedule()` built one un-chunked statement each,
  exceeding Postgres's 65,534-bound-parameter limit at ~5,000 tasks --
  now batched in groups of 1,000 rows. Neither was reachable at Phase
  11a's 1,200-task gate scale.
- **`GET /schedules/current?projectId=`** (new): the one-call
  convenience read the Gantt page needs -- the project's current
  version plus every task/dependency/calendar it owns -- instead of the
  two-round-trip `GET /schedules` + `GET /schedules/versions/:id/tasks`
  path 9e shipped.
- The UI itself (virtualized task grid, canvas timeline, filters, PNG
  export) is pure client-side rendering against that read -- no new
  tables, no write path beyond the existing `POST /schedules/import`.

## 9g. Look-ahead, PPC, constraints, progress capture (Addendum A6/A7, Phase 11c)

Full detail in `docs/ROADMAP.md`'s Phase 11c gate report; summarised here
for the data-model-adjacent parts.

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `lookahead_commitments` | *(9e, extended)* + status (`promised/confirmed/declined`) | fk `lookahead_plans`, fk `schedule_tasks` | 9e shipped the table with no status column (schema only); this phase adds the confirm/decline state and the endpoints that drive it |
| `schedule_constraints` | task_id, category (`design/material/permit/access/labour/prerequisite/other`), description, owner_company_id?, need_by_date, status (`open/cleared`), cleared_at?, cleared_by? | fk `schedule_tasks`, fk `companies`, fk `users` | Scoped to a specific task row -- **not carried forward across a re-import**, unlike `record_links` (9e) |
| `schedule_progress_updates` | task_id, submitted_by, proposed_percent_complete?, proposed_actual_start?/finish?, note?, photo_attachment_id?, status (`pending/accepted/rejected`), reviewed_by?, reviewed_at?, rejection_reason? | fk `schedule_tasks`, fk `users`, fk `attachments` | The only path a mobile field submission has into `schedule_tasks` is `acceptScheduleProgressUpdate()` -- submission alone never mutates the task |
| `daily_log_delays` | *(existing, extended)* + schedule_task_id? | fk `schedule_tasks` | Nullable "delay linkage" -- a delay entry can optionally point at the task it affected, feeding the delay register |

**API surface**: `lookahead.service.ts`/`.routes.ts` (`GET /lookahead/view`
— ad-hoc unsaved window; `GET /lookahead/companies` — a schedule-scoped
company-name lookup added specifically so a foreman without financial
read-access can still resolve company names, see the gate report; `GET
/lookahead/delays` — the delay register; plans/commitments/PPC CRUD),
`schedule-constraints.routes.ts`, `schedule-progress.routes.ts` (submit +
planner accept/reject), plus a fourth `SYNC_ENTITY_TYPES` entry
(`schedule_progress_update`, create-only — no field-merge/conflict path,
unlike `daily_log`) wired into `sync.service.ts`'s two exhaustive
`switch` statements.

**Scope cuts, documented rather than silently incomplete:**
- Look-ahead plans publish immediately at creation (`publishedAt`/
  `publishedBy` set at insert) -- no separate draft/publish workflow.
- `schedule_constraints` and `schedule_progress_updates` are **not**
  carried forward across a schedule re-import, unlike `record_links`:
  both key off a specific `cpm_schedule_tasks` row, which a re-import
  never mutates (it creates new rows in a new version instead).
- No photo attachment on a progress update submitted from mobile --
  `photo_attachment_id` exists in the schema and the web form supports
  it, but photo upload is online-only (Phase 2's presign/confirm flow),
  so it can't travel through a fully-offline `sync/push`.
- Mobile ships read-only-ish "my tasks" + progress-capture + commitment
  confirm/decline screens only -- no mobile constraint-log or
  delay-register views (planner/PM tools, already on web).

## 9h. Branded PDF exports, company logo, correspondence signature (user-directed, Phase 12)

Not part of the original functional-spec phase plan -- added on explicit
user request (PDF export for RFI/Submittal/Change Order; a company logo
on those PDFs; a signature requirement to send formal Correspondence).
Full detail in `docs/ROADMAP.md`'s Phase 12 gate report.

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `companies` | *(existing, extended)* + logo_data_base64?, logo_mime? | none (no FK; a company's own record) | Inline base64 PNG, not the `attachments`/S3 pipeline -- a company isn't project-scoped, unlike every attachment. `logo_data_base64` is stripped from every list/detail JSON response (only `GET /companies/:id/logo` returns it) via a `hasLogo` boolean instead |
| `correspondence` | *(existing, extended)* + sender_signature_name? | none (new column only) | Typed-name signature, captured at the same draft->sent transition that already sets `sent_date` |

**RLS change**: `companies` previously had SELECT (`is_company_visible` --
member, or shares a project with the company) and INSERT policies only,
no UPDATE policy at all (an open gap since Phase 1, invisible until this
phase needed to actually write to the table). Added
`companies_member_update`, scoped to the **stricter**
`is_company_member` (a real `user_companies` row, not merely
project-sharing visibility) -- a collaborator who can see a company's
branding should not be able to overwrite it.

**API surface**: `POST /companies/:id/logo` + `GET /companies/:id/logo`;
`GET /rfis/:id/report`, `GET /submittals/:id/report`, `GET
/change-orders/:id/report`, `GET /correspondence/:id/report` (all
`application/pdf`, built with a new shared `PdfBuilder`
(`apps/api/src/lib/pdf-builder.ts`) extracted from Phase 5's Inspection
report generator). RFI/Submittal/Change Order have no direct "author
company" column, so their PDF branding resolves via `project_users
.companyId` for the record's creator; Correspondence already has
`from_company_id` directly.

**Scope cuts, documented rather than silently incomplete:**
- Signature is a typed name + timestamp, not a drawn signature (explicit
  user choice, see gate report).
- Logo is per-company, not per-project (explicit user choice) -- set once
  on the company record (Companies settings page in `apps/web`), reused
  across every project that company works on.
- No PDF export added for Punch Items, Meetings, T&M Tickets, Daily Logs,
  or any other module -- only the three the user named. The `PdfBuilder`
  pattern makes adding one elsewhere a small, mechanical follow-up.
- No "DRAFT" watermark on a not-yet-approved document's PDF -- status is
  shown as plain header text instead.

## 9i. "Export all" summary PDF registers, A4 default page size (user-directed, Phase 13)

No schema change -- a follow-up to 9h adding a project-wide table-summary
PDF per module alongside the existing single-item exports, and switching
`PdfBuilder`'s default page size from US Letter to A4 for every export
(new and existing alike). Full detail in `docs/ROADMAP.md`'s Phase 13 gate
report.

**API surface**: `GET /{rfis,submittals,change-orders,correspondence,inspections}/summary-report?projectId=`
(all `application/pdf`), each backed by a `get*ListReportData()` in the
module's service and a `generate*ListPdf()` in `apps/api/src/lib/`, both
using `PdfBuilder`'s new `drawTable()` method (a header row repeated on
every page a register spans, cells word-wrapped per column). A register's
branding resolves to the *requesting user's own* company on the project
(`resolveAuthorCompanyBranding()`, reused with the caller's `userId`)
rather than any one row's author, since a register spans many. Inspection's
register is unbranded, matching its existing single-item report (Phase 5
predates Phase 12's letterhead).

**Scope cuts, documented rather than silently incomplete:**
- No filtering/sorting on a summary endpoint -- every item on the project,
  matching "export all" literally.
- No CSV/Excel export -- PDF only, as asked. (Added in Phase 17, see
  9j -- each of these five registers now also answers `?format=csv`.)
- Inspection's register left unbranded rather than retrofitting Phase 12's
  letterhead onto Phase 5's generator.

## 9j. Analytics/BI + CSV registers (user-directed, Phase 17)

No schema change -- every trend/cycle-time figure is derived from
timestamps already stored for another reason (`created_at`, status-history
rows, `occurred_at`/`closed_at`, `approval_chain` entries). Full detail in
`docs/ROADMAP.md`'s Phase 17 gate report.

**API surface**: `GET /projects/:id/analytics` -- gated on `reports:read`
(the first real enforcement of that long-defined-but-unused permission
module), with each section additionally gated on its own module's `read`
permission, mirroring `dashboard.service.ts`'s per-section omission.
Sections: RFIs, Punch List, Submittals, Safety, Change Orders. Also: the
five Phase 13 `summary-report` routes (9i) now accept `?format=csv` and
return the same rows as their PDF twin, serialized via `export.service.ts`'s
`to*RegisterCsv()` functions -- same permission gate as the PDF, no new
one.

**Scope cuts, documented rather than silently incomplete:**
- Company-level (cross-project) analytics -- per-project only.
- No custom report builder -- five fixed trend views, not an ad-hoc query
  interface.
- No periodic metrics-snapshot job -- trends only cover what timestamped
  data already exists, so there's no history before a record's own
  creation date.

## 9k. Action Plans (user-directed, Phase 18)

| Table | Key fields | Relationships | Notes |
|---|---|---|---|
| `action_plan_templates` | project_id, name, description | fk projects | Admin-authored, reusable; `directory:admin` gated writes |
| `action_plan_template_items` | template_id, description, default_due_days, sort_order | fk action_plan_templates, cascade delete | `default_due_days` is a UI hint only, never enforced server-side |
| `action_plans` | project_id, template_id (nullable), name, source_type (reuses `corrective_action_source_type`), source_id | fk projects; fk action_plan_templates, set null on delete | No `status` column -- derived at read time from linked `corrective_actions` rows |

`corrective_actions` gained a nullable `action_plan_id` fk (set null on
delete) -- instantiating a plan bulk-creates one ordinary
`corrective_actions` row per item, each stamped with the new plan's id,
rather than a parallel item-tracking system. Every existing corrective-
action list/transition/permission code path (9b) keeps working
unchanged; an Action Plan is a named, templated *batch* of corrective
actions, not a new kind of tracked item. Full detail in
`docs/ROADMAP.md`'s Phase 18 gate report.

**API surface**: `/action-plan-templates` (template + item CRUD,
`directory:admin` writes / `safety:read` listing) and `/action-plans`
(`POST` instantiates -- `safety:standard`, matching
`createCorrectiveAction`'s own gate; `GET` lists with a derived
`status`/`itemCount`/`completedCount` per plan, `safety:read`).

**Scope cuts, documented rather than silently incomplete:**
- Project-scoped templates only -- no company-level template library.
- No automatic triggering -- every instantiation is an explicit action
  from `CorrectiveActionsPanel`, never a rule engine.
- Only reachable from the Safety Incident and Safety Observation pages
  today, the same reach `CorrectiveActionsPanel` itself already had
  (the `inspection` source type is schema/service-supported but has no
  UI entry point yet, predating this phase).

## 9l. Email-to-project logging (user-directed, Phase 19)

`projects` gained `inbound_email_token` (uuid, unique, server-generated via
`defaultRandom()` like every id column) -- the local part of the address
`<token>@INBOUND_EMAIL_DOMAIN` a registered project member CCs or forwards
mail to. `POST /internal/inbound-email` (machine-to-machine, gated by the
`x-inbound-email-secret` shared secret like `/internal/rfi-overdue-check`,
not a session) accepts a provider-agnostic payload (`to`/`from`/`subject`/
`text`/`attachments[]` -- see `inboundEmailWebhookSchema`), resolves the
token to a project and the `from` address to a registered `users.email`,
and -- only if that person is an actual member of that project with
`correspondence:standard` -- logs the message as an ordinary "incoming"
Correspondence row (9-era `correspondence` table), with any attachments
stored through the existing `attachments` table under `ownerType:
"correspondence"`. No new correspondence subtype and no parallel inbox
table; email is just another way to create the same row the manual
"New Correspondence" form does.

**Sender/company resolution** (both looked up inside the same
`withRequestContext` as the write, once the sender is confirmed a real
project member):
- `fromCompanyId` = the sender's own company on this project
  (`project_users.company_id`), the same source `resolveAuthorCompanyBranding`
  already uses for report branding.
- `toCompanyId` = the project's `gc`-type company (`project_companies` join
  `companies` where `type = 'gc'`) -- a deterministic stand-in for "the
  project" as an addressee, since the correspondence schema requires two
  distinct companies and email-to-project logging has no explicit
  recipient the way the manual form does.

**Why the pre-auth split matters**: this webhook has no JWT/session to
derive an RLS context from, so the *project*-by-token and *user*-by-email
lookups run against `authDb` (bypassing RLS) -- a fourth "genuinely
pre-authentication" case alongside login-by-email/invite-token/
refresh-token (§5 of `CLAUDE.md`). Everything after the sender is
identified -- the membership/permission check and the actual write --
runs through `appDb` under that sender's own RLS context, exactly as if
they'd made the request with a real session.

**Scope cuts, documented rather than silently incomplete:**
- Only a registered, current project member's own email address is
  accepted as sender -- there is no concept of logging mail from an
  external party who isn't a platform user (real Procore ties inbound
  email to a project user's account the same way).
- The generic webhook payload shape (`inboundEmailWebhookSchema`) is
  provider-agnostic on purpose: translating a real inbound-email
  provider's native webhook format (SendGrid Inbound Parse, Mailgun
  Routes, SES receipt rules) into this shape is a deployment-time
  webhook-config concern, not application code -- this app has no
  production inbound-email account configured. `INBOUND_EMAIL_DOMAIN`
  is not, by itself, a deliverable mailbox.
- No reply-by-email or threading -- each inbound message becomes one new
  Correspondence row; there's no concept of an email thread mapping to a
  single, growing record.

## 9m. Mobile push notifications (Phase 20)

New `push_tokens` table (`user_id`, `token` unique, `platform` enum
`ios`/`android`, `created_at`) -- one row per registered device, extending
Phase 16's notification pipeline (`notification.service.ts`) from the web
bell to `apps/mobile` via Expo's push service. `notifyUser()` (the single
choke point every RFI/Submittal/Punch Item/Change Order notification call
site already goes through, unchanged) now also reads the recipient's
tokens and fires a fire-and-forget POST to Expo's push API
(`apps/api/src/lib/push.ts`) after inserting the notification row -- never
awaited, every failure swallowed, exactly like `auth.service.ts`'s
existing `sendInviteEmail(...).catch(...)` precedent for invite emails. No
existing call site changed.

**RLS**: `push_tokens` needed a policy shape none of this schema's
existing tables have -- two legitimate operations cross the "owns this
row" boundary a strict self-only policy can't express in one statement:
dispatching a push (the *actor* reads the *recipient*'s tokens) and a
device changing hands (Expo issues the same token to whoever's logged
into the same app install, so re-registering upserts across an ownership
boundary). Rather than a `SECURITY DEFINER` helper, this table trusts the
API layer the way `notifications_insert` already does for INSERT: any
authenticated session may read/insert/update/delete, `WITH CHECK` only
pins the *written* row's `user_id` to the caller's own. See the policy's
own comment in `001_rls_and_functions.sql` for the full reasoning,
including why DELETE has no equivalent DB-level pin (relies on
`push-token.service.ts`'s own `WHERE user_id = caller` scoping).

**API surface**: `POST /push-tokens` (register/reassign, upsert on the
token's own uniqueness) and `DELETE /push-tokens` (self-scoped removal,
a no-op rather than an error if the caller doesn't own that token) --
both under `requireAuth`, no per-project permission (a device isn't
scoped to a project).

**Mobile wiring** (`apps/mobile`): `expo-notifications` (`~0.29.14`, the
SDK 52-bundled version) -- flagged here as a new dependency per CLAUDE.md
rule 10, though it's a first-party Expo package extending the
already-locked Expo stack, not an outside-the-stack swap.
`AuthProvider` requests permission and registers the device's Expo push
token whenever `auth` becomes non-null (covers both a fresh login and a
restored session on relaunch), and unregisters it on logout, while the
session is still valid to authenticate the call. `app/_layout.tsx`'s
`NotificationTapHandler` deep-links a tapped notification straight to its
RFI/Submittal/Punch Item/Change Order screen, mirroring
`NotificationBell.entityPath` on web exactly (same payload shape, same
four modules with a detail screen to land on).

**Scope cuts, documented rather than silently incomplete:**
- No EAS project is configured in this sandbox, so `getExpoPushTokenAsync()`
  will typically fail (swallowed, logged) in this dev environment; wiring
  a real EAS project id is a deployment-time step, not application code.
- No notification categories/actions (e.g. an inline "Mark read" action
  from the OS notification tray) -- tapping only opens the app to the
  entity.
- No badge count sync between the OS app icon badge and the in-app unread
  count; `shouldSetBadge: false` in the foreground handler is deliberate.

## 9n. Server-driven list query contract (Phase 21, first module: RFIs)

No new tables. This documents the reusable pattern a module's list
endpoint follows once migrated off "fetch everything, filter client-side"
-- the pattern proven on RFIs, meant to be copied by future module
migrations rather than re-invented per module.

**Shared contract** (`packages/shared/src/schemas/list-query.schema.ts`):
`paginationQuerySchema` -- `search?`, `sort?`, `direction?` (`asc`/`desc`),
`page?`, `pageSize?` (capped at `MAX_PAGE_SIZE=200`, default
`DEFAULT_PAGE_SIZE=50`) -- all optional. A module extends it with its own
sort-key enum and filter fields (see `listRfisQuerySchema` in
`rfi.schema.ts` for the RFI shape: `sort` narrowed to
`"number"|"subject"|"status"|"dueDate"`, plus `status`/`assigneeUserId`),
`.strict()`'d so an unrecognized query param 400s rather than being
silently ignored. The service layer returns
`PaginatedResult<T> = { rows: T[]; total: number }`.

**Backward-compatibility rule, load-bearing for every migration**: the
response body never changes shape -- it's always the plain array it
always was, never wrapped in an envelope. Pagination/search/sort/filtering
only activate when the caller's query string explicitly sends those
params; omitting `page`/`pageSize` returns every row, exactly as before.
`total` rides along as an `X-Total-Count` response header, not a body
field. This is why mobile and every not-yet-migrated web caller needed
zero changes when the RFI endpoint gained this contract. A route parses an
explicit object of the relevant query keys before calling
`.parse()` -- never `schema.parse(req.query)` directly -- since `req.query`
carries other keys (e.g. `projectId`) the `.strict()` schema would reject.

**CORS**: any header a migrated endpoint adds (here, `X-Total-Count`) must
be added to `apps/api/src/app.ts`'s `cors({ exposedHeaders: [...] })` or
it's invisible to `apps/web`'s cross-origin `fetch()` in dev -- a class of
bug supertest-based API tests cannot catch, since supertest doesn't
enforce browser header-visibility rules. Confirm this whenever a new
module's migration adds its own count/meta header.

**Privacy/visibility filters move into SQL, not post-fetch JS**: RFI's
private-RFI visibility rule (`canViewPrivateRfi`, used elsewhere by
`getRfi`) was re-expressed as a SQL `OR`/`EXISTS` predicate in `listRfis`
once `LIMIT`/`OFFSET` entered the picture -- filtering rows out after the
database has already paginated them produces wrong `total` counts and
short pages. Any module with a similar per-row visibility rule (beyond the
project-membership/permission-level check already enforced upstream)
needs the same treatment when it migrates.

**Web side** (`apps/web`): `components/ui/DataTable.tsx` gained optional
`serverSort`/`onServerSortChange`/`pagination` props -- omitting them keeps
a table's original fully-client-side sort behavior unchanged, so migrating
one module's list page never affects any other page still on `DataTable`.
`lib/use-server-table.ts`'s `useServerTable<T>` hook owns the fetch glue
(debounced search, immediate filter/sort/page refetch, request-id
guarding against out-of-order responses, reads `X-Total-Count`) a
migrated page wires into `DataTable`'s new props and a `FilterBar`.
`components/ui/SavedViewsBar.tsx` reuses the existing generic
`/saved-views` API unchanged -- its `filters` column is schemaless
`jsonb`, so a view's stored blob was simply extended to flatten
`search`/`sortKey`/`sortDirection` in alongside a module's own filter
keys (see `SavedViewsBar.tsx`'s `toStoredState`/`fromStoredState`).

**Deliberately not adopted**: TanStack Query, despite CLAUDE.md's stack
table naming it -- nothing in `apps/web` actually depended on it before or
after this phase. `useServerTable` is a small local hook because the
actual problem (no server query contract) doesn't require a caching
library, and adopting one now would touch every existing page's dependency
footprint for no problem it uniquely solves. Revisit only if a real
caching/dedup need surfaces once more modules migrate.

**Migrated so far, and initiative complete as of Phase 26** (Phase 21 +
22 + 23 + 24 + 25 + 26): RFIs, Submittals, Change Orders, Punch List,
Commitments, Documents, Drawings, Meetings, Correspondence, Inspections,
T&M Tickets, Transmittals, Safety Incidents, Direct Costs, Payment
Applications (Billing), Prequalification, Safety Observations, Schedule
(manual task list), Bidding (bid packages), Estimating. **Every real list
module in the app now has server-side search/filter/sort/pagination.**
**Prime Contract is not a list module at all** -- `prime-contract.service.ts`
has no `list*` function, only `getPrimeContractByProject` (one row per
project, enforced by a unique index), and its page is a detail/edit
form, not a table; earlier phase notes that filed it under "still on
client-side filtering" were imprecise and are corrected here. Phase 26
also produced two closing wrinkles worth keeping as reference: Schedule's
pre-migration default order was `sortOrder, startDate` (a manual
drag-order), not one column like every other module, so
`listScheduleTasksQuerySchema` documents that omitting `sort` preserves
that exact ordering rather than falling back to a single default column
-- the one deliberate exception to every other module's "default sort
key" convention; and Bidding's "Cost Code" column got the same
drop-`sortValue` treatment as Direct Costs' (Phase 25) since it's a
joined lookup by `costCodeId` with `number`/`title` already giving the
module a real search/sort surface, so a join wasn't judged worth it
there (contrast with Payment Applications/Prequalification below, which
had no plain column at all and so *did* get a join). Any new list module
added after this point should follow this same pattern from the start
(extend the shared query schema, do search/filter/sort/pagination in
SQL, wire the page onto `useServerTable` + `DataTable`'s server props)
rather than shipping a client-side-filtered list to migrate later.

**When a module has no plain text column at all to search or sort by,
join to the table that does, the same way Inspections joined
`checklist_templates` in Phase 24 -- don't just drop the feature.**
Phase 25's Payment Applications (`payment_applications` has only
`commitmentId`/dates/`status`, no title) and Prequalification
(`prequalifications` has only `companyId`/`status`/score fields) both
hit this: `listPaymentApplications` does a `leftJoin` to `commitments`
(left, since `commitmentId` is nullable for a prime-contract
application) and searches/sorts on `commitments.number`/`title`;
`listPrequalifications` does an `innerJoin` to `companies` and
searches/sorts on `companies.name`. This is a different call than the
"drop `sortValue`" fix below: that one applies when the module *already
has* a plain field to fall back on (Commitments' own `number`/`title`,
T&M Tickets' `description`, Safety Incidents' `description`) and the
joined field is a bonus that wasn't judged worth a join; here, without
the join there is nothing to search or sort by at all, so the join is
the whole feature, not an add-on.

**Not every list page uses `DataTable`, and `useServerTable` migrates
onto a plain card list just as well -- there's no column header to
click, so drive sort from an explicit control instead.** Prequalification
and Safety Observations (Phase 25) both render an array of expandable
cards with inline forms, not a `DataTableColumn[]` table -- migrating
them still means real server-side search/filter/sort/pagination, just
without `DataTable`'s built-in sortable-header and pagination-footer
UI. The fix used here: a plain `<select>` next to `FilterBar` that calls
`serverTable.onServerSortChange(key)` on change (exactly what a column
header does internally), and a hand-rolled pagination footer copying
`DataTable`'s own markup/classes so it looks identical. Any future
non-tabular list page should follow this same recipe rather than
skipping sort/pagination because "there's no table."

**A `DataTable` column's `key` must exactly match a member of its
module's server sort-key enum whenever that column also sets
`sortValue` -- found as a live bug in three already-shipped modules
during Phase 24, none of them user-reported.** `DataTable.tsx`'s
`handleSort(col)` calls `onServerSortChange(col.key)` for any
server-sortable column (guarded by `if (!col.sortValue) return;`), which
means the resulting `sort=<key>` query param must be a member of that
module's `z.enum(...)` sort-key list or the request 400s -- surfacing to
the user as a generic error only when they click that specific column
header, which nothing in typecheck/lint/the existing test suite catches.
Two shapes of the same bug, and two different fixes:
  1. **The sorted field is a genuine plain column that was simply left out
     of the enum** (Punch List's "description" column, shipped in Phase
     22): add it to both the sort-key enum and the service's sort-column
     map. Straightforward, no behavior lost.
  2. **The sorted field is a joined/derived value with no server sort
     support** (Commitments' "company" column in Phase 22, T&M Tickets'
     "company" column and Safety Incidents' "involved company" column
     both in Phase 24 -- all three render a company name looked up by
     `companyId`, not a plain column): remove the `sortValue` prop
     entirely, making the column display-only. Plumbing an actual SQL
     join through just to sort one column wasn't judged worth it, same
     call already made for Commitments' matching search gap.
When migrating or auditing any module's list page, check every column
with a `sortValue` against that module's sort-key enum -- a mismatch is
silent until a user clicks that exact header. `phase24-list-query.test.ts`
has a `sort=company` rejection test for both T&M Tickets and Safety
Incidents as regression coverage for shape 2's fix holding.

**A module's "essential scoping param" is not the same thing as an
optional FilterBar filter, and the two need different treatment.**
Documents (Phase 23) is folder-scoped: `folderId` is something the
folder-browser sidebar *always* sends, never something a user toggles
in the FilterBar UI the way a status chip works. It stays a plain
function parameter on `document.service.ts`'s `listDocuments`, outside
the `ListDocumentsQuery` bag entirely -- on the web side, folder
selection drives it by calling `serverTable.onFilterChange("folderId",
...)` directly (bypassing the `FilterBar` component, which never renders
a "folder" filter chip at all) rather than inventing a separate code path
for one scoping param. Any future module with a similar "always-present,
UI-driven-elsewhere" scoping dimension should follow this same split:
real optional filters go in the query schema; an essential scope
parameter that some other piece of UI (a sidebar, a tab, a parent
record) always supplies stays a plain parameter.

**A migrated page's `serverTable.rows` (one page of results) is not
always sufficient for every feature on that same page.** Drawings'
"publish a set" picker (Phase 23) needs the complete list of every
drawing with a current revision to choose from -- paginating the
DataTable must never silently truncate what that picker can see. The fix
is a second, separately-fetched, deliberately unpaginated request
(`revisionedDrawings` in `drawings/page.tsx`) alongside the paginated
`useServerTable` instance, refreshed on the same create/publish events.
Change Orders' target-company dropdowns (Phase 22) took the same shape
one phase earlier, sourced from an already-separate unpaginated endpoint.
Before migrating any page, check whether its data list is reused
somewhere else on the same page (a picker, a dropdown, a lookup) --
if so, that consumer needs its own fetch, not `serverTable.rows`.

**The contract adapts to what a module's schema actually has, rather than
forcing a uniform filter shape onto every module.** Two examples from
Phase 22: Submittals has its own `submittalDistribution` join table
structurally identical to RFIs' `rfiDistribution`, so
`canViewPrivateSubmittal`'s visibility rule got the exact same SQL
`EXISTS` rewrite `canViewPrivateRfi` did in Phase 21 -- any future module
with a distribution-list-style privacy flag should follow this same
recipe. Commitments, by contrast, has neither a `status` nor a `dueDate`
column at all (`packages/db/src/schema/financial.ts`), so its query
schema filters on `type` (subcontract/po) and `companyId` instead of the
`status`/`assigneeUserId` shape every other migrated module uses --
check what a module's schema and its existing detail-page fields actually
support before choosing that module's filter set, don't copy the RFI
shape reflexively. Commitments' migration also dropped one narrow bit of
behavior: its page previously searched the *joined* company name
client-side, which the SQL-side search does not match (only
`number`/`title`, like every other module) -- matching a joined field
would need an actual join in the query, and wasn't judged worth it for
one page's search box; flag this if a user ever asks for it back.

**`SavedViewsBar` proved reusable on its second consumer.** Punch List
had its own older, bespoke saved-views UI (a plain button row storing
only a single status value) predating Phase 21's generalized component;
Phase 22 retired it in favor of `SavedViewsBar` with no changes needed to
the component itself -- confirming it was built broadly enough in Phase
21 to fit an independently-evolved saved-views implementation, not just
the one page it was extracted from.

## 9o. DataTable column visibility (Phase 27)

No new tables or endpoints. With the list-query-contract initiative
closed out (Phase 26), this picks up the next item the "Enterprise UX,
Data Architecture & PDF System Upgrade" spec named and `DataTable.tsx`'s
own doc comment had flagged since its first pass (Phase "UX/UI foundation
pass": `git log --oneline -- apps/web/components/ui/DataTable.tsx`):
"column resize, visibility toggles, and bulk row selection are
deliberately not in this first pass." Column resize and bulk row
selection remain deferred (resize interacts with the `react-window`
virtualization's fixed grid-template sizing in a way that needs its own
design pass; bulk actions need a bulk-mutation endpoint per module, a
much larger surface). Column visibility does not need either -- it is
purely a client-side render filter over the same `columns` array every
page already builds.

**Shape**: `DataTableColumn<T>` gained an optional `hideable?: boolean`
(defaults to `true`; a page sets it `false` on a column that must always
stay visible, e.g. an identifying number column -- no migrated page
needed this yet, so none currently sets it). `DataTable`'s `Props<T>`
gained an optional `storageKey?: string`. Both are additive: a column
that doesn't set `hideable` and a table that doesn't pass `storageKey`
behave exactly as before -- the same "omit it, get the old behavior"
shape every other DataTable prop (`serverSort`, `pagination`) already
uses. When `storageKey` is set, a "Columns" button appears above the
header row; its checklist menu can hide any column except one marked
`hideable: false`, and the toggle refuses to hide the last remaining
visible column outright (checked in `toggleColumn` before the state
update, not just in the UI) so a table can never be checked into an
empty, headerless state.

**Persistence is per-browser, not per-user-in-the-database, and that's
deliberate**: hidden-column keys are stored in `localStorage` under
`siteops.dataTableHiddenColumns.<storageKey>`, the same per-browser-only
pattern `GlobalSearch`'s recent-searches list already established
(`components/shell/GlobalSearch.tsx`'s `loadRecent`/`saveRecent`) --
read/write wrapped in `try/catch` since `localStorage` can throw (private
browsing, quota). This is a smaller, purely-cosmetic preference than a
`SavedViewsBar` view (search/filter/sort a user wants to name and share
across devices via the project-scoped `/saved-views` API); inventing a
server round trip for "which columns are hidden on my screen right now"
would be over-engineering the feature relative to what it's for. Revisit
only if a real cross-device sync need for this specific preference shows
up.

**Rollout**: every one of the ~20 pages already on `DataTable` (the same
set enumerated in §9n's "migrated so far," plus Budget's line-item table,
which was never part of the list-query-contract rollout since it has no
list endpoint of its own to paginate) got a `storageKey` unique to that
page (`"rfis"`, `"submittals"`, `"schedule"`, etc.) in this same phase --
unlike the list-query contract, which was deliberately proven on one
module before rolling out over several phases, wiring this feature is a
one-line, purely-additive prop per call site with no server-side
counterpart to design per module, so there was no reason to stage it.

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
