import { boolean, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { companies, projects, users } from "./core";

export const rfiStatusEnum = pgEnum("rfi_status", ["draft", "open", "answered", "closed"]);

export const rfis = pgTable(
  "rfis",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    number: varchar("number", { length: 50 }).notNull(),
    subject: varchar("subject", { length: 300 }).notNull(),
    question: text("question").notNull(),
    status: rfiStatusEnum("status").notNull().default("draft"),
    ballInCourtUserId: uuid("ball_in_court_user_id").references(() => users.id),
    ballInCourtCompanyId: uuid("ball_in_court_company_id").references(() => companies.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    costImpactFlag: boolean("cost_impact_flag").notNull().default(false),
    scheduleImpactFlag: boolean("schedule_impact_flag").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...auditColumns(),
  },
  (table) => [
    index("rfis_ball_in_court_user_idx").on(table.ballInCourtUserId),
    index("rfis_status_due_date_idx").on(table.status, table.dueDate),
  ],
);

export const rfiResponses = pgTable("rfi_responses", {
  id: idColumn(),
  rfiId: uuid("rfi_id")
    .notNull()
    .references(() => rfis.id),
  respondedBy: uuid("responded_by")
    .notNull()
    .references(() => users.id),
  responseText: text("response_text").notNull(),
  isOfficial: boolean("is_official").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rfiDistribution = pgTable("rfi_distribution", {
  id: idColumn(),
  rfiId: uuid("rfi_id")
    .notNull()
    .references(() => rfis.id),
  userId: uuid("user_id").references(() => users.id),
  companyId: uuid("company_id").references(() => companies.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
