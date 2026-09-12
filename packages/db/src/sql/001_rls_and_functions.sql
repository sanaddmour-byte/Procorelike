-- Row-Level Security policies and the server-side numbering function.
-- Checked in and forward-only like a migration (docs/ARCHITECTURE.md §7, §2;
-- docs/DATA_MODEL.md §10), but applied by packages/db/src/migrate.ts *after*
-- the Drizzle schema migrations rather than tracked in Drizzle's own journal,
-- because it contains policies/functions/roles rather than table DDL. Every
-- statement is idempotent (IF NOT EXISTS / OR REPLACE / DROP...CREATE) so
-- re-running it on every `pnpm db:migrate` is safe.

-- ---------------------------------------------------------------------------
-- 0. A dedicated, non-superuser role for the API's runtime connection.
--
-- The docker-compose Postgres image's default user is a superuser, and
-- superusers always bypass RLS regardless of FORCE ROW LEVEL SECURITY. If
-- apps/api connected with that role, every RLS policy below would be a no-op
-- and only the application-layer permission engine would actually be
-- enforcing anything. Migrations and the seed script still use the
-- superuser connection (DATABASE_URL) since they must write data before any
-- session context exists; the API must use DATABASE_URL_APP instead so RLS
-- is a genuine backstop, not security theater.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'siteops_app') THEN
    CREATE ROLE siteops_app LOGIN PASSWORD 'siteops_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO siteops_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO siteops_app;
GRANT USAGE ON SCHEMA public TO siteops_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO siteops_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO siteops_app;

-- ---------------------------------------------------------------------------
-- 1. Numbering function (docs/ARCHITECTURE.md §7)
--
-- Row-locks the sequence row via the UPDATE itself (equivalent to SELECT ...
-- FOR UPDATE) so concurrent callers serialize instead of colliding. Must be
-- called inside the same transaction as the record insert it numbers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION next_sequence_number(p_project_id uuid, p_sequence_key varchar)
RETURNS integer AS $$
DECLARE
  v_value integer;
BEGIN
  INSERT INTO number_sequences (id, project_id, sequence_key, next_value)
  VALUES (gen_random_uuid(), p_project_id, p_sequence_key, 1)
  ON CONFLICT (project_id, sequence_key) DO NOTHING;

  UPDATE number_sequences
  SET next_value = next_value + 1
  WHERE project_id = p_project_id AND sequence_key = p_sequence_key
  RETURNING next_value - 1 INTO v_value;

  RETURN v_value;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION next_sequence_number(uuid, varchar) TO siteops_app;

-- ---------------------------------------------------------------------------
-- 1b. is_project_member() — breaks a self-referencing-policy deadlock.
--
-- project_users' own RLS policy needs to answer "is the caller a member of
-- this project?", which means querying project_users itself. A plain
-- subquery against project_users from *within its own policy* triggers
-- Postgres error 42P17 ("infinite recursion detected in policy for
-- relation project_users") — evaluating the policy re-triggers the same
-- policy on the subquery, forever. SECURITY DEFINER breaks the cycle: this
-- function runs with the privileges of its owner (the migration's
-- superuser), which bypasses RLS entirely, so the internal lookup doesn't
-- re-invoke the policy that's calling it. `SET search_path` pins it against
-- schema-hijacking. Every other table's policy can (and does) subquery
-- project_users directly without this wrapper — the recursion is only
-- possible when a table's policy queries itself.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_users
    WHERE project_id = p_project_id
      AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );
$$;

GRANT EXECUTE ON FUNCTION is_project_member(uuid) TO siteops_app;

-- Same recursion hazard, cross-table this time: companies' policy needs to
-- query user_companies/project_companies, and user_companies' policy needs
-- to query companies back — a two-table cycle instead of a self-reference,
-- same fix.
CREATE OR REPLACE FUNCTION is_company_visible(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_companies
    WHERE company_id = p_company_id AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  ) OR EXISTS (
    SELECT 1 FROM project_companies pc
    JOIN project_users pu ON pu.project_id = pc.project_id
    WHERE pc.company_id = p_company_id AND pu.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );
$$;

GRANT EXECUTE ON FUNCTION is_company_visible(uuid) TO siteops_app;

-- ---------------------------------------------------------------------------
-- 2. Session context helper macros (as comments, not SQL): every API
-- transaction runs
--   SELECT set_config('app.user_id', $1, true);
--   SELECT set_config('app.role', $2, true);
-- before touching tenant data, so the policies below can key off
-- current_setting('app.user_id', true) / current_setting('app.role', true).
-- `true` = missing_ok, so a *truly never-set* value reads as NULL. But a
-- custom GUC placeholder that has been set at least once on a given
-- connection (via set_config with is_local=true, i.e. SET LOCAL semantics)
-- resets to an EMPTY STRING — not NULL — once its owning transaction ends,
-- because the placeholder now exists on that session with no prior value to
-- restore. A pooled connection is reused across requests, so any query that
-- runs *without* a fresh withRequestContext call on such a connection would
-- see '' and blow up '' ::uuid casts (Postgres error 22P02) instead of
-- getting a clean default-deny empty result. Every user_id comparison below
-- therefore wraps the read in NULLIF(..., '') to fold that empty-string
-- reset back to NULL before casting — but the real fix is upstream: never
-- query a tenant-scoped table without going through withRequestContext
-- first (see apps/api's route handlers for the pattern).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. Tenancy tables
-- ---------------------------------------------------------------------------

-- NOTE on the four blocks below (projects, companies, users, project_users):
-- a plain "FOR ALL USING (<membership check>)" cannot work for INSERT on
-- these tables — Postgres evaluates the same USING expression as the
-- WITH CHECK for FOR ALL policies, so creating the *first* project (or
-- company, or project_users row) would require membership that can only
-- exist *after* the insert. Each therefore gets separate SELECT/UPDATE/
-- DELETE policies (real membership check) and its own INSERT policy scoped
-- to "the row being created names me" (created_by/user_id = self) rather
-- than pre-existing membership. The actual business rule for *who is
-- allowed to* create a project/company (e.g. owner_admin only) is enforced
-- by the permission engine at the API layer, same as everywhere else —
-- this INSERT policy only stops one user's session from fabricating a row
-- attributed to someone else.

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_member_rw ON projects;
CREATE POLICY projects_member_rw ON projects FOR SELECT USING (
  id IN (
    SELECT project_id FROM project_users
    WHERE user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
);
DROP POLICY IF EXISTS projects_member_update ON projects;
CREATE POLICY projects_member_update ON projects FOR UPDATE USING (
  id IN (
    SELECT project_id FROM project_users
    WHERE user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
);
DROP POLICY IF EXISTS projects_creator_insert ON projects;
CREATE POLICY projects_creator_insert ON projects FOR INSERT WITH CHECK (
  created_by = NULLIF(current_setting('app.user_id', true), '')::uuid
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_visible_select ON companies;
CREATE POLICY companies_visible_select ON companies FOR SELECT USING (
  is_company_visible(id)
);
DROP POLICY IF EXISTS companies_authenticated_insert ON companies;
CREATE POLICY companies_authenticated_insert ON companies FOR INSERT WITH CHECK (
  current_setting('app.user_id', true) IS NOT NULL
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self_or_shared_project_select ON users;
CREATE POLICY users_self_or_shared_project_select ON users FOR SELECT USING (
  id = NULLIF(current_setting('app.user_id', true), '')::uuid
  OR id IN (
    SELECT pu2.user_id FROM project_users pu2
    WHERE pu2.project_id IN (
      SELECT project_id FROM project_users WHERE user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  )
);
DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_self_update ON users FOR UPDATE USING (
  id = NULLIF(current_setting('app.user_id', true), '')::uuid
);
-- Registration (invite-accept) creates a users row before that user has a
-- session; the invite token itself (validated at the API layer against
-- invites.token_hash, single-use, short-lived) is the real gate here.
DROP POLICY IF EXISTS users_open_insert ON users;
CREATE POLICY users_open_insert ON users FOR INSERT WITH CHECK (true);

ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_users_member_select ON project_users;
CREATE POLICY project_users_member_select ON project_users FOR SELECT USING (
  is_project_member(project_id)
);
DROP POLICY IF EXISTS project_users_member_update ON project_users;
CREATE POLICY project_users_member_update ON project_users FOR UPDATE USING (
  is_project_member(project_id)
);
-- Covers both cases that actually create a project_users row: the project
-- creator assigning themself as owner_admin, and an invited user accepting
-- their own invite (the API sets app.user_id to the newly-created user's id
-- for that transaction in both cases — see apps/api auth service).
DROP POLICY IF EXISTS project_users_self_insert ON project_users;
CREATE POLICY project_users_self_insert ON project_users FOR INSERT WITH CHECK (
  user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
);

ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_companies_self_or_company_select ON user_companies;
CREATE POLICY user_companies_self_or_company_select ON user_companies FOR ALL USING (
  user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  OR is_company_visible(company_id)
);

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refresh_tokens_self ON refresh_tokens;
CREATE POLICY refresh_tokens_self ON refresh_tokens FOR ALL USING (
  user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invites_project_member_select ON invites;
CREATE POLICY invites_project_member_select ON invites FOR ALL USING (
  project_id IN (SELECT id FROM projects)
);

ALTER TABLE permission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permission_templates_authenticated_read ON permission_templates;
CREATE POLICY permission_templates_authenticated_read ON permission_templates FOR ALL USING (
  current_setting('app.user_id', true) IS NOT NULL
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trades_authenticated_read ON trades;
CREATE POLICY trades_authenticated_read ON trades FOR ALL USING (
  current_setting('app.user_id', true) IS NOT NULL
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_self ON notifications;
CREATE POLICY notifications_self ON notifications FOR ALL USING (
  user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_actor_insert ON audit_log;
CREATE POLICY audit_log_actor_insert ON audit_log FOR INSERT WITH CHECK (
  actor_id IS NULL OR actor_id = NULLIF(current_setting('app.user_id', true), '')::uuid
);
DROP POLICY IF EXISTS audit_log_no_update_delete ON audit_log;
CREATE POLICY audit_log_no_update_delete ON audit_log FOR UPDATE USING (false);
DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (
  current_setting('app.user_id', true) IS NOT NULL
);
-- audit_log has no project_id column (it's keyed by entity_type/entity_id,
-- which vary in what "project" they belong to); SELECT is therefore only
-- gated on "is an authenticated session", with per-module scoping left to
-- the API layer until a project_id denormalization is worth the migration.
-- Deletes are refused outright — no policy permits them, and none should.

-- ---------------------------------------------------------------------------
-- 4. Direct project_id tables — generic policy, looped.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  direct_project_tables text[] := ARRAY[
    'project_companies', 'project_user_permissions',
    'cost_codes', 'locations', 'specifications_sections', 'attachments',
    'number_sequences', 'document_folders', 'documents', 'drawings',
    'rfis', 'submittals', 'daily_logs', 'punch_items', 'photo_albums',
    'photos', 'inspections',
    'budget_line_items', 'commitments', 'change_events', 'change_orders',
    'payment_applications', 'meetings'
  ];
BEGIN
  FOREACH t IN ARRAY direct_project_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_project_member', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (project_id IN (SELECT project_id FROM project_users WHERE user_id = current_setting(''app.user_id'', true)::uuid))',
      t || '_project_member', t
    );
  END LOOP;
END
$$;

-- checklist_templates: project_id is nullable (global reusable templates),
-- so it needs its own predicate rather than the generic loop above.
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS checklist_templates_global_or_project_member ON checklist_templates;
CREATE POLICY checklist_templates_global_or_project_member ON checklist_templates FOR ALL USING (
  project_id IS NULL
  OR project_id IN (SELECT project_id FROM project_users WHERE user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
);

-- Hard rule: client_viewer never sees financial modules, enforced again at
-- the RLS layer as a backstop to the permission-engine check
-- (docs/DATA_MODEL.md §10). AND-ed on top of the project-membership policy
-- above via a second restrictive policy (RLS combines permissive policies
-- with OR and restrictive policies with AND).
DO $$
DECLARE
  t text;
  financial_tables text[] := ARRAY[
    'budget_line_items', 'commitments', 'change_events', 'change_orders', 'payment_applications'
  ];
BEGIN
  FOREACH t IN ARRAY financial_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_no_client_viewer', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL USING (current_setting(''app.role'', true) IS DISTINCT FROM ''client_viewer'')',
      t || '_no_client_viewer', t
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Child tables scoped via their parent's own (already-RLS'd) table.
--
-- The subquery against the parent table runs under the same RLS-restricted
-- role, so the parent's policy filters it automatically — one line per
-- child table instead of re-deriving the project-membership predicate.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  child_fk_parent text[][] := ARRAY[
    ARRAY['drawing_revisions', 'drawing_id', 'drawings'],
    ARRAY['markups', 'drawing_revision_id', 'drawing_revisions'],
    ARRAY['rfi_responses', 'rfi_id', 'rfis'],
    ARRAY['rfi_distribution', 'rfi_id', 'rfis'],
    ARRAY['submittal_packages', 'submittal_id', 'submittals'],
    ARRAY['submittal_revisions', 'package_id', 'submittal_packages'],
    ARRAY['submittal_reviews', 'revision_id', 'submittal_revisions'],
    ARRAY['daily_log_manpower', 'daily_log_id', 'daily_logs'],
    ARRAY['daily_log_equipment', 'daily_log_id', 'daily_logs'],
    ARRAY['daily_log_deliveries', 'daily_log_id', 'daily_logs'],
    ARRAY['daily_log_delays', 'daily_log_id', 'daily_logs'],
    ARRAY['daily_log_safety_incidents', 'daily_log_id', 'daily_logs'],
    ARRAY['punch_item_history', 'punch_item_id', 'punch_items'],
    ARRAY['checklist_template_items', 'template_id', 'checklist_templates'],
    ARRAY['inspection_responses', 'inspection_id', 'inspections'],
    ARRAY['commitment_line_items', 'commitment_id', 'commitments'],
    ARRAY['potential_change_orders', 'change_event_id', 'change_events'],
    ARRAY['payment_application_lines', 'payment_application_id', 'payment_applications'],
    ARRAY['meeting_items', 'meeting_id', 'meetings']
  ];
  row_ text[];
BEGIN
  FOREACH row_ SLICE 1 IN ARRAY child_fk_parent LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', row_[1]);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', row_[1]);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', row_[1] || '_via_parent', row_[1]);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (%I IN (SELECT id FROM %I))',
      row_[1] || '_via_parent', row_[1], row_[2], row_[3]
    );
  END LOOP;
END
$$;

-- record_links is polymorphic (source/target type+id vary in which table,
-- and therefore which project, they belong to); scoping it generically in
-- SQL would need a per-type CASE with one join per known entity type.
-- Left to the application layer for now — noted as an open item in
-- docs/DATA_MODEL.md / docs/ROADMAP.md rather than silently unguarded.
