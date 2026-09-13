import { boolean, date, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { attachments, companies, costCodes, locations, projects, trades, users } from "./core";

/**
 * Scheduling & Gantt (Addendum A, docs/SCHEDULING.md), deliberately built
 * last per explicit instruction -- see docs/ROADMAP.md's Phase plan,
 * Phase 11a-11d. Tier A (import + visualise) only in this phase; Tier B
 * (native CPM editing) is a later, feature-flagged phase.
 *
 * Naming: Phase 9 shipped a flat-list "schedule_tasks" table (renamed to
 * "manual_schedule_tasks" in migration 0014, see ./schedule.ts) to free
 * this name up for the versioned model below, which is a fundamentally
 * different shape (per-version rows, WBS, CPM fields) than a simple
 * per-project task list.
 */

export const scheduleSourceToolEnum = pgEnum("schedule_source_tool", [
  "manual",
  "ms_project_xml",
  "p6_xer",
  "p6_xml",
  "csv",
]);

/** One per project. `currentVersionId` has no DB-level FK (would be a circular reference with schedule_versions.schedule_id) -- enforced and kept consistent at the service layer only; documented here rather than silently assumed. */
export const schedules = pgTable(
  "schedules",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    sourceTool: scheduleSourceToolEnum("source_tool").notNull().default("manual"),
    defaultCalendarId: uuid("default_calendar_id"),
    currentVersionId: uuid("current_version_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("schedules_project_id_idx").on(table.projectId)],
);

export const scheduleVersions = pgTable(
  "schedule_versions",
  {
    id: idColumn(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id),
    versionNo: integer("version_no").notNull(),
    dataDate: date("data_date", { mode: "string" }).notNull(),
    isBaseline: boolean("is_baseline").notNull().default(false),
    baselineLabel: varchar("baseline_label", { length: 200 }),
    importedFrom: scheduleSourceToolEnum("imported_from").notNull(),
    importedBy: uuid("imported_by")
      .notNull()
      .references(() => users.id),
    sourceFileAttachmentId: uuid("source_file_attachment_id").references(() => attachments.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("schedule_versions_schedule_id_idx").on(table.scheduleId),
    uniqueIndex("schedule_versions_schedule_id_version_no_unique").on(table.scheduleId, table.versionNo),
  ],
);

export const calendars = pgTable(
  "calendars",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: varchar("name", { length: 200 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    hoursPerDay: numeric("hours_per_day", { precision: 4, scale: 2 }).notNull().default("8"),
    /**
     * Bitmask, bit 0 = Sunday ... bit 6 = Saturday. Default 0b0011111 = 31
     * (Sun-Thu working) -- ar-JO's actual working week, NOT Mon-Fri. See
     * docs/SCHEDULING.md A10: "do not default to a Monday-Friday week."
     */
    workingDays: integer("working_days").notNull().default(31),
    ...auditColumns(),
  },
  (table) => [index("calendars_project_id_idx").on(table.projectId)],
);

export const calendarExceptions = pgTable(
  "calendar_exceptions",
  {
    id: idColumn(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id),
    date: date("date", { mode: "string" }).notNull(),
    isWorking: boolean("is_working").notNull(),
    workingMinutes: integer("working_minutes"),
    label: varchar("label", { length: 200 }),
  },
  (table) => [
    index("calendar_exceptions_calendar_id_idx").on(table.calendarId),
    uniqueIndex("calendar_exceptions_calendar_id_date_unique").on(table.calendarId, table.date),
  ],
);

export const scheduleTaskTypeEnum = pgEnum("schedule_task_type", ["task", "summary", "milestone", "loe", "wbs"]);

export const scheduleTaskConstraintEnum = pgEnum("schedule_task_constraint", [
  "asap",
  "alap",
  "snet",
  "snlt",
  "fnet",
  "fnlt",
  "mso",
  "mfo",
]);

/**
 * The versioned CPM task -- one row per task per imported/edited version,
 * never mutated across versions (a re-import creates new rows in a new
 * version; see the diff logic in schedule-import.ts). `externalId` and
 * `wbsCode` are the identifiers a re-import diff matches on, in that
 * order, before falling back to fuzzy name matching (docs/SCHEDULING.md
 * A2) -- both indexed for that lookup.
 */
export const cpmScheduleTasks = pgTable(
  "schedule_tasks",
  {
    id: idColumn(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => scheduleVersions.id),
    externalId: varchar("external_id", { length: 200 }),
    wbsCode: varchar("wbs_code", { length: 200 }),
    parentTaskId: uuid("parent_task_id"),
    name: varchar("name", { length: 500 }).notNull(),
    taskType: scheduleTaskTypeEnum("task_type").notNull().default("task"),
    durationMinutes: integer("duration_minutes"),
    calendarId: uuid("calendar_id").references(() => calendars.id),
    earlyStart: timestamp("early_start", { withTimezone: true }),
    earlyFinish: timestamp("early_finish", { withTimezone: true }),
    lateStart: timestamp("late_start", { withTimezone: true }),
    lateFinish: timestamp("late_finish", { withTimezone: true }),
    plannedStart: timestamp("planned_start", { withTimezone: true }),
    plannedFinish: timestamp("planned_finish", { withTimezone: true }),
    actualStart: timestamp("actual_start", { withTimezone: true }),
    actualFinish: timestamp("actual_finish", { withTimezone: true }),
    totalFloatMinutes: integer("total_float_minutes"),
    freeFloatMinutes: integer("free_float_minutes"),
    isCritical: boolean("is_critical").notNull().default(false),
    percentComplete: integer("percent_complete").notNull().default(0),
    physicalPercentComplete: integer("physical_percent_complete"),
    constraintType: scheduleTaskConstraintEnum("constraint_type"),
    constraintDate: timestamp("constraint_date", { withTimezone: true }),
    responsibleCompanyId: uuid("responsible_company_id").references(() => companies.id),
    tradeId: uuid("trade_id").references(() => trades.id),
    locationId: uuid("location_id").references(() => locations.id),
    costCodeId: uuid("cost_code_id").references(() => costCodes.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("schedule_tasks_version_id_idx").on(table.versionId),
    index("schedule_tasks_external_id_idx").on(table.externalId),
    index("schedule_tasks_wbs_code_idx").on(table.wbsCode),
  ],
);

export const taskDependencyTypeEnum = pgEnum("task_dependency_type", ["FS", "SS", "FF", "SF"]);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: idColumn(),
    predecessorId: uuid("predecessor_id")
      .notNull()
      .references(() => cpmScheduleTasks.id),
    successorId: uuid("successor_id")
      .notNull()
      .references(() => cpmScheduleTasks.id),
    type: taskDependencyTypeEnum("type").notNull().default("FS"),
    lagMinutes: integer("lag_minutes").notNull().default(0),
  },
  (table) => [
    index("task_dependencies_predecessor_id_idx").on(table.predecessorId),
    index("task_dependencies_successor_id_idx").on(table.successorId),
    uniqueIndex("task_dependencies_pred_succ_type_unique").on(table.predecessorId, table.successorId, table.type),
  ],
);

/**
 * A variance snapshot: for a task in the *current* version, what its
 * corresponding task looked like in a given baseline version (baselines
 * are just schedule_versions with is_baseline=true -- this table exists
 * so variance queries don't need to join across versions by
 * external_id/wbs_code every time).
 */
export const taskBaselineValues = pgTable(
  "task_baseline_values",
  {
    id: idColumn(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => cpmScheduleTasks.id),
    baselineVersionId: uuid("baseline_version_id")
      .notNull()
      .references(() => scheduleVersions.id),
    plannedStart: timestamp("planned_start", { withTimezone: true }),
    plannedFinish: timestamp("planned_finish", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
  },
  (table) => [
    index("task_baseline_values_task_id_idx").on(table.taskId),
    uniqueIndex("task_baseline_values_task_baseline_unique").on(table.taskId, table.baselineVersionId),
  ],
);

export const lookaheadPlans = pgTable(
  "lookahead_plans",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    horizonWeeks: integer("horizon_weeks").notNull().default(3),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("lookahead_plans_project_id_idx").on(table.projectId)],
);

export const lookaheadCommitments = pgTable(
  "lookahead_commitments",
  {
    id: idColumn(),
    lookaheadPlanId: uuid("lookahead_plan_id")
      .notNull()
      .references(() => lookaheadPlans.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => cpmScheduleTasks.id),
    promisedFinish: date("promised_finish", { mode: "string" }).notNull(),
    committedByCompanyId: uuid("committed_by_company_id")
      .notNull()
      .references(() => companies.id),
    actualFinish: date("actual_finish", { mode: "string" }),
    reasonCode: varchar("reason_code", { length: 100 }),
  },
  (table) => [index("lookahead_commitments_lookahead_plan_id_idx").on(table.lookaheadPlanId)],
);
