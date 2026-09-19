import { boolean, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn } from "./columns";
import { permissionLevelEnum, permissionModuleEnum, projects } from "./core";

/**
 * Admin-configurable narrowing of the hardcoded status-transition state
 * machines (RFI_STATUS_TRANSITIONS, PUNCH_ITEM_STATUS_TRANSITIONS, ...).
 * A row here can only make a transition *stricter* than the hardcoded
 * default -- disable it outright, or raise the permission level required
 * to perform it -- never add a transition the code doesn't already allow.
 * Absence of a row for a (module, fromStatus, toStatus) tuple means "use
 * the module's hardcoded default", so this table starts empty and only
 * ever holds explicit admin overrides.
 */
export const workflowTransitionRules = pgTable(
  "workflow_transition_rules",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    module: permissionModuleEnum("module").notNull(),
    fromStatus: varchar("from_status", { length: 100 }).notNull(),
    toStatus: varchar("to_status", { length: 100 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    requiredLevel: permissionLevelEnum("required_level").notNull().default("standard"),
  },
  (table) => [
    uniqueIndex("workflow_transition_rules_project_module_from_to_idx").on(
      table.projectId,
      table.module,
      table.fromStatus,
      table.toStatus,
    ),
  ],
);
