# Data Model — ProcoreLike (SiteOps)

Design-level schema for approval before Phase 1 (actual Drizzle schema +
migrations are written in Phase 1 from this document). Column lists are the
fields that matter for business logic and review, not exhaustive DDL.

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

Safety incidents recorded in Daily Log free text in T1; a dedicated
`safety_incidents` table (linked from Daily Log) arrives with the T3 Safety
module — flagged as an Assumption below on whether T1 needs a minimal
structured incident record earlier.

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

## 10. Row-Level Security approach

Every tenant-scoped table gets an RLS policy of the shape:

```sql
USING (project_id IN (
  SELECT project_id FROM project_users WHERE user_id = current_setting('app.user_id')::uuid
))
```

with module-specific tightening for the two hard rules from the brief:

- **Subcontractor scoping**: an additional policy branch restricting
  `subcontractor`-role sessions to rows where their company is the
  assignee/ball-in-court/distribution recipient (per-module — RFIs check
  `rfi_distribution`, Punch Items check `assignee_company_id`, etc.).
- **Client financial exclusion**: `client_viewer` role is denied at the
  RLS layer on all T2 tables outright (`USING (current_setting('app.role') <> 'client_viewer')`
  combined with the project-membership check), in addition to the API-layer
  rejection — belt and suspenders per the brief's explicit requirement.

`app.user_id` / `app.role` are set via `SET LOCAL` at the start of each
API request's transaction, derived from the verified JWT — never trusted
from a client-supplied header.

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

## 13. Open items carried into Phase 1

- Finalize exact `permission_templates` default rows per role × module
  (a full matrix — drafted in Phase 1, not invented here to avoid
  churn before the module list is locked by phase).
- Confirm Hijri-calendar display is out of scope for v1 (Gregorian +
  `ar-JO` number formatting only) — see Assumptions.
- Decide whether a minimal structured `safety_incidents` table is needed
  in T1 (Daily Log) ahead of the full T3 Safety module, or free-text is
  acceptable until then — see Assumptions.
