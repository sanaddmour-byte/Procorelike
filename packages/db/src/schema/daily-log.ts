import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns, idColumn, syncColumns } from "./columns";
import { companies, projects, trades, users } from "./core";

export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    logDate: timestamp("log_date", { withTimezone: false, mode: "date" }).notNull(),
    weatherJson: jsonb("weather_json"),
    notes: text("notes"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    signedBy: uuid("signed_by").references(() => users.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
    ...syncColumns(),
  },
  (table) => [uniqueIndex("daily_logs_project_date_unique").on(table.projectId, table.logDate)],
);

export const dailyLogManpower = pgTable("daily_log_manpower", {
  id: idColumn(),
  dailyLogId: uuid("daily_log_id")
    .notNull()
    .references(() => dailyLogs.id),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  tradeId: uuid("trade_id")
    .notNull()
    .references(() => trades.id),
  headcount: integer("headcount").notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
});

export const dailyLogEquipment = pgTable("daily_log_equipment", {
  id: idColumn(),
  dailyLogId: uuid("daily_log_id")
    .notNull()
    .references(() => dailyLogs.id),
  equipmentDesc: varchar("equipment_desc", { length: 300 }).notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  hours: numeric("hours", { precision: 6, scale: 2 }),
});

export const dailyLogDeliveries = pgTable("daily_log_deliveries", {
  id: idColumn(),
  dailyLogId: uuid("daily_log_id")
    .notNull()
    .references(() => dailyLogs.id),
  entryType: varchar("entry_type", { length: 20 }).notNull().default("delivery"), // "delivery" | "visitor"
  description: text("description").notNull(),
  receivedBy: varchar("received_by", { length: 200 }),
});

export const dailyLogDelays = pgTable("daily_log_delays", {
  id: idColumn(),
  dailyLogId: uuid("daily_log_id")
    .notNull()
    .references(() => dailyLogs.id),
  causeCode: varchar("cause_code", { length: 100 }).notNull(),
  description: text("description").notNull(),
  hoursImpact: numeric("hours_impact", { precision: 6, scale: 2 }),
});

/**
 * Minimal structured safety-incident record living on Daily Log ahead of the
 * full T3 Safety module, so T3 can extend rather than migrate this data
 * (docs/ROADMAP.md Assumption #9 — flagged for confirmation).
 */
export const dailyLogSafetyIncidents = pgTable("daily_log_safety_incidents", {
  id: idColumn(),
  dailyLogId: uuid("daily_log_id")
    .notNull()
    .references(() => dailyLogs.id),
  severity: varchar("severity", { length: 50 }).notNull(),
  description: text("description").notNull(),
  involvedCompanyId: uuid("involved_company_id").references(() => companies.id),
});
