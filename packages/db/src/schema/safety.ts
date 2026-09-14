import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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

/** OSHA 300 Log case classification -- exactly one of these applies to a recordable case (29 CFR 1904.7); "not_recordable" is the default for everything that never rises to OSHA recordability (most near-misses/minor incidents). */
export const oshaClassificationEnum = pgEnum("osha_classification", [
  "not_recordable",
  "death",
  "days_away_from_work",
  "job_transfer_or_restriction",
  "other_recordable",
]);

/** OSHA 300 Log's injury/illness type columns (M1-M6) -- only meaningful once oshaClassification is not "not_recordable". */
export const injuryIllnessTypeEnum = pgEnum("injury_illness_type", [
  "injury",
  "skin_disorder",
  "respiratory_condition",
  "poisoning",
  "hearing_loss",
  "other_illness",
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
    /** OSHA 300 Log fields (29 CFR 1904) -- only meaningful when oshaClassification isn't "not_recordable". */
    oshaClassification: oshaClassificationEnum("osha_classification").notNull().default("not_recordable"),
    injuryIllnessType: injuryIllnessTypeEnum("injury_illness_type"),
    bodyPart: varchar("body_part", { length: 200 }),
    daysAwayFromWork: integer("days_away_from_work").notNull().default(0),
    daysJobTransferOrRestriction: integer("days_job_transfer_or_restriction").notNull().default(0),
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

export const correctiveActionSourceTypeEnum = pgEnum("corrective_action_source_type", [
  "safety_incident",
  "safety_observation",
  "inspection",
]);

export const correctiveActionStatusEnum = pgEnum("corrective_action_status", [
  "open",
  "in_progress",
  "completed",
  "verified",
]);

/**
 * Procore's Corrective Actions: a trackable, assignable, due-dated action
 * item spawned from an incident, observation, or failed inspection --
 * distinct from safetyIncidents.correctiveAction, which is just a free-text
 * note recorded when closing an incident. One source record can have many
 * corrective actions (e.g. an incident needing both an equipment fix and a
 * retraining session).
 */
export const correctiveActions = pgTable(
  "corrective_actions",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    sourceType: correctiveActionSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    description: text("description").notNull(),
    assignedToUserId: uuid("assigned_to_user_id")
      .notNull()
      .references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: false, mode: "date" }).notNull(),
    status: correctiveActionStatusEnum("status").notNull().default("open"),
    completedBy: uuid("completed_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [
    index("corrective_actions_project_id_idx").on(table.projectId),
    index("corrective_actions_source_idx").on(table.sourceType, table.sourceId),
  ],
);
