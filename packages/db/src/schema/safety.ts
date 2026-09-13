import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { companies, locations, projects, users } from "./core";

export const safetyIncidentSeverityEnum = pgEnum("safety_incident_severity", [
  "near_miss",
  "minor",
  "serious",
  "critical",
]);

export const safetyIncidentStatusEnum = pgEnum("safety_incident_status", [
  "open",
  "investigating",
  "closed",
]);

/**
 * A project-wide, always-listed incident record -- distinct from
 * `daily_log_safety_incidents` (Phase 1/T1's lightweight quick-capture
 * embedded in a Daily Log entry, which is unchanged). The two lists are
 * not unified in v1: a Daily Log incident note doesn't automatically
 * create one of these, and vice versa. Documented gap, not an oversight
 * -- see docs/ROADMAP.md Phase 9 gate report.
 */
export const safetyIncidents = pgTable(
  "safety_incidents",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    severity: safetyIncidentSeverityEnum("severity").notNull(),
    description: text("description").notNull(),
    involvedCompanyId: uuid("involved_company_id").references(() => companies.id),
    injuredPersonName: varchar("injured_person_name", { length: 200 }),
    status: safetyIncidentStatusEnum("status").notNull().default("open"),
    correctiveAction: text("corrective_action"),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("safety_incidents_project_id_idx").on(table.projectId)],
);

export const safetyObservationCategoryEnum = pgEnum("safety_observation_category", [
  "unsafe_condition",
  "unsafe_act",
  "near_miss",
  "good_catch",
]);

export const safetyObservationStatusEnum = pgEnum("safety_observation_status", [
  "open",
  "resolved",
]);

/** Lighter-weight than an incident: no injury/investigation workflow, just "seen something, logged it, resolved it." */
export const safetyObservations = pgTable(
  "safety_observations",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    category: safetyObservationCategoryEnum("category").notNull(),
    description: text("description").notNull(),
    status: safetyObservationStatusEnum("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("safety_observations_project_id_idx").on(table.projectId)],
);
