import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, syncColumns } from "./columns";
import { companies, locations, projects, trades, users } from "./core";
import { drawingRevisions, markups } from "./documents";

export const punchItemStatusEnum = pgEnum("punch_item_status", [
  "open",
  "ready_for_review",
  "approved",
  "closed",
]);

export const punchItemPriorityEnum = pgEnum("punch_item_priority", ["low", "medium", "high"]);

export const punchItems = pgTable(
  "punch_items",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    number: varchar("number", { length: 50 }).notNull(),
    description: text("description").notNull(),
    locationId: uuid("location_id").references(() => locations.id),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    assigneeCompanyId: uuid("assignee_company_id").references(() => companies.id),
    tradeId: uuid("trade_id").references(() => trades.id),
    priority: punchItemPriorityEnum("priority").notNull().default("medium"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: punchItemStatusEnum("status").notNull().default("open"),
    drawingRevisionId: uuid("drawing_revision_id").references(() => drawingRevisions.id),
    markupId: uuid("markup_id").references(() => markups.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
    ...syncColumns(),
  },
  (table) => [
    index("punch_items_project_id_idx").on(table.projectId),
    // The daily digest sweep (jobs/daily-digest-sweep.ts) queries "every
    // open punch item assigned to any user" across *all* projects --
    // without this, that's a full-table scan as the seed grows.
    index("punch_items_assignee_user_id_idx").on(table.assigneeUserId),
  ],
);

/** Additional personnel a punch item should notify/involve, alongside the single assigneeUserId -- mirrors rfis.ts's rfiDistribution. */
export const punchItemDistribution = pgTable(
  "punch_item_distribution",
  {
    id: idColumn(),
    punchItemId: uuid("punch_item_id")
      .notNull()
      .references(() => punchItems.id),
    userId: uuid("user_id").references(() => users.id),
    companyId: uuid("company_id").references(() => companies.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("punch_item_distribution_punch_item_id_idx").on(table.punchItemId)],
);

export const punchItemHistory = pgTable(
  "punch_item_history",
  {
    id: idColumn(),
    punchItemId: uuid("punch_item_id")
      .notNull()
      .references(() => punchItems.id),
    fromStatus: punchItemStatusEnum("from_status"),
    toStatus: punchItemStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id),
    note: text("note"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("punch_item_history_punch_item_id_idx").on(table.punchItemId)],
);
