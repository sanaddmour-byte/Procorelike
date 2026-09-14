import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { companies, costCodes, projects, users } from "./core";

export const commitmentTypeEnum = pgEnum("commitment_type", ["subcontract", "po"]);
export const changeOrderTargetTypeEnum = pgEnum("change_order_target_type", [
  "prime",
  "commitment",
]);
export const changeStatusEnum = pgEnum("change_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "void",
]);
/** Procore's Change Event workflow status: separate from a change order's own approval status. */
export const changeEventStatusEnum = pgEnum("change_event_status", ["open", "incorporated", "void"]);
/** Procore's standard Change Event/Order Reason categories. */
export const changeReasonEnum = pgEnum("change_reason", [
  "owner_change",
  "design_development",
  "allowance",
  "value_engineering",
  "unforeseen_condition",
  "errors_omissions",
  "rfi",
  "other",
]);
export const paymentApplicationStatusEnum = pgEnum("payment_application_status", [
  "draft",
  "submitted",
  "certified",
  "paid",
]);

export const budgetLineItems = pgTable(
  "budget_line_items",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    costCodeId: uuid("cost_code_id")
      .notNull()
      .references(() => costCodes.id),
    originalAmount: numeric("original_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    approvedChangesAmount: numeric("approved_changes_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    projectedAmount: numeric("projected_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    forecastToComplete: numeric("forecast_to_complete", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("budget_line_items_project_id_idx").on(table.projectId)],
);

export const commitments = pgTable(
  "commitments",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    number: varchar("number", { length: 50 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    type: commitmentTypeEnum("type").notNull(),
    costCodeId: uuid("cost_code_id").references(() => costCodes.id),
    retentionPct: numeric("retention_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("commitments_project_id_idx").on(table.projectId)],
);

export const commitmentLineItems = pgTable(
  "commitment_line_items",
  {
    id: idColumn(),
    commitmentId: uuid("commitment_id")
      .notNull()
      .references(() => commitments.id),
    costCodeId: uuid("cost_code_id")
      .notNull()
      .references(() => costCodes.id),
    description: varchar("description", { length: 300 }).notNull(),
    scheduleOfValuesAmount: numeric("schedule_of_values_amount", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [index("commitment_line_items_commitment_id_idx").on(table.commitmentId)],
);

export const changeEvents = pgTable(
  "change_events",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    potentialCostImpact: numeric("potential_cost_impact", { precision: 14, scale: 2 }),
    status: changeEventStatusEnum("status").notNull().default("open"),
    reason: changeReasonEnum("reason").notNull().default("other"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("change_events_project_id_idx").on(table.projectId)],
);

export const potentialChangeOrders = pgTable(
  "potential_change_orders",
  {
    id: idColumn(),
    changeEventId: uuid("change_event_id")
      .notNull()
      .references(() => changeEvents.id),
    costImpact: numeric("cost_impact", { precision: 14, scale: 2 }),
    timeImpactDays: integer("time_impact_days"),
    status: changeStatusEnum("status").notNull().default("draft"),
  },
  (table) => [index("potential_change_orders_change_event_id_idx").on(table.changeEventId)],
);

export const changeOrders = pgTable(
  "change_orders",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    number: varchar("number", { length: 50 }).notNull(),
    title: varchar("title", { length: 300 }),
    pcoId: uuid("pco_id").references(() => potentialChangeOrders.id),
    targetType: changeOrderTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: changeReasonEnum("reason").notNull().default("other"),
    costImpact: numeric("cost_impact", { precision: 14, scale: 2 }).notNull(),
    timeImpactDays: integer("time_impact_days").notNull().default(0),
    /** Procore's "Executed" flag: the CO has been physically signed by all parties -- distinct from the internal approvalChain, which only tracks this org's own sign-off. */
    executed: boolean("executed").notNull().default(false),
    /** Ordered list of { userId, companyId, role, approvedAt } — see @siteops/shared approval-threshold. */
    approvalChain: jsonb("approval_chain")
      .notNull()
      .default([])
      .$type<{ userId: string; companyId: string; role: string; approvedAt: string }[]>(),
    status: changeStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [
    index("change_orders_project_id_idx").on(table.projectId),
    // commitment.service.ts's contract-value computation and any
    // "changes against this budget line" lookup both filter on this
    // polymorphic pair.
    index("change_orders_target_idx").on(table.targetType, table.targetId),
  ],
);

export const paymentApplications = pgTable(
  "payment_applications",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    commitmentId: uuid("commitment_id").references(() => commitments.id), // null = prime contract application
    periodStart: timestamp("period_start", { withTimezone: false, mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: false, mode: "date" }).notNull(),
    retentionPct: numeric("retention_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    status: paymentApplicationStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [
    index("payment_applications_project_id_idx").on(table.projectId),
    // billing.service.ts's previousPctComplete walks prior applications
    // for the same commitment ordered by period -- this is that query's
    // filter column.
    index("payment_applications_commitment_id_idx").on(table.commitmentId),
  ],
);

export const paymentApplicationLines = pgTable(
  "payment_application_lines",
  {
    id: idColumn(),
    paymentApplicationId: uuid("payment_application_id")
      .notNull()
      .references(() => paymentApplications.id),
    sovLineId: uuid("sov_line_id")
      .notNull()
      .references(() => commitmentLineItems.id),
    pctCompletePrevious: numeric("pct_complete_previous", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    pctCompleteThisPeriod: numeric("pct_complete_this_period", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
  },
  (table) => [
    index("payment_application_lines_payment_application_id_idx").on(table.paymentApplicationId),
    index("payment_application_lines_sov_line_id_idx").on(table.sovLineId),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    title: varchar("title", { length: 300 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    attendees: jsonb("attendees").notNull().default([]),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("meetings_project_id_idx").on(table.projectId)],
);

export const meetingItems = pgTable(
  "meeting_items",
  {
    id: idColumn(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id),
    description: text("description").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    status: varchar("status", { length: 50 }).notNull().default("open"),
    carriedForwardFromItemId: uuid("carried_forward_from_item_id"),
    convertedToType: varchar("converted_to_type", { length: 50 }),
    convertedToId: uuid("converted_to_id"),
  },
  (table) => [index("meeting_items_meeting_id_idx").on(table.meetingId)],
);
