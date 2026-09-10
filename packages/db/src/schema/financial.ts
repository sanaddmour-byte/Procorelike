import {
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
export const paymentApplicationStatusEnum = pgEnum("payment_application_status", [
  "draft",
  "submitted",
  "certified",
  "paid",
]);

export const budgetLineItems = pgTable("budget_line_items", {
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
  ...auditColumns(),
});

export const commitments = pgTable("commitments", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
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
});

export const commitmentLineItems = pgTable("commitment_line_items", {
  id: idColumn(),
  commitmentId: uuid("commitment_id")
    .notNull()
    .references(() => commitments.id),
  costCodeId: uuid("cost_code_id")
    .notNull()
    .references(() => costCodes.id),
  scheduleOfValuesAmount: numeric("schedule_of_values_amount", { precision: 14, scale: 2 }).notNull(),
});

export const changeEvents = pgTable("change_events", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  potentialCostImpact: numeric("potential_cost_impact", { precision: 14, scale: 2 }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const potentialChangeOrders = pgTable("potential_change_orders", {
  id: idColumn(),
  changeEventId: uuid("change_event_id")
    .notNull()
    .references(() => changeEvents.id),
  costImpact: numeric("cost_impact", { precision: 14, scale: 2 }),
  timeImpactDays: integer("time_impact_days"),
  status: changeStatusEnum("status").notNull().default("draft"),
});

export const changeOrders = pgTable("change_orders", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  number: varchar("number", { length: 50 }).notNull(),
  pcoId: uuid("pco_id").references(() => potentialChangeOrders.id),
  targetType: changeOrderTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  costImpact: numeric("cost_impact", { precision: 14, scale: 2 }).notNull(),
  timeImpactDays: integer("time_impact_days").notNull().default(0),
  /** Ordered list of { userId, companyId, role, approvedAt? } — see @siteops/shared approval-threshold. */
  approvalChain: jsonb("approval_chain").notNull().default([]),
  status: changeStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  ...auditColumns(),
});

export const paymentApplications = pgTable("payment_applications", {
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
  ...auditColumns(),
});

export const paymentApplicationLines = pgTable("payment_application_lines", {
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
});

export const meetings = pgTable("meetings", {
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
});

export const meetingItems = pgTable("meeting_items", {
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
});
