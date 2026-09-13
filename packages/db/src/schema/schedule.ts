import { date, index, integer, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { companies, projects, users } from "./core";

export const scheduleTaskStatusEnum = pgEnum("schedule_task_status", [
  "not_started",
  "in_progress",
  "complete",
  "delayed",
]);

/**
 * Deliberately flat: no predecessor/successor dependency graph or
 * critical-path calculation. A real scheduling engine (dependency types,
 * float, auto-shifting downstream dates) is a substantial project of its
 * own -- this is a task list with dates and percent-complete, which
 * covers "what's supposed to happen when" without pretending to be
 * Primavera/MS Project. See docs/ROADMAP.md Phase 9 gate report.
 *
 * SQL table renamed from "schedule_tasks" to "manual_schedule_tasks" in
 * Phase 11a (migration 0014) to free up the "schedule_tasks" name for
 * the new versioned CPM model in ./cpm-schedule.ts -- see
 * docs/SCHEDULING.md's naming note. The Drizzle TS export name
 * (`scheduleTasks`) is unchanged, so no API/web/mobile code needed to
 * change: this is a database-level rename only.
 */
export const scheduleTasks = pgTable(
  "manual_schedule_tasks",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    percentComplete: integer("percent_complete").notNull().default(0),
    status: scheduleTaskStatusEnum("status").notNull().default("not_started"),
    assignedCompanyId: uuid("assigned_company_id").references(() => companies.id),
    /** Manual display order within the project's task list (no dependency graph to derive it from). */
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("manual_schedule_tasks_project_id_idx").on(table.projectId)],
);
