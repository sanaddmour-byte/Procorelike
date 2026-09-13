import { index, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { companies, projects, users } from "./core";

export const tmTicketStatusEnum = pgEnum("tm_ticket_status", ["draft", "submitted", "approved", "rejected"]);

/**
 * A time-and-material ticket documents work performed outside the fixed
 * contract scope, billed on labor/equipment/material actuals rather than a
 * lump sum -- distinct from a commitment (Phase 6) or change order, which
 * this ticket may later support as backup but does not create automatically
 * in v1 (documented simplification: no auto-linking to change_events).
 */
export const tmTickets = pgTable(
  "tm_tickets",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    ticketNumber: varchar("ticket_number", { length: 20 }).notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    workDate: timestamp("work_date", { withTimezone: false, mode: "date" }).notNull(),
    description: text("description").notNull(),
    status: tmTicketStatusEnum("status").notNull().default("draft"),
    submittedBy: uuid("submitted_by").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("tm_tickets_project_id_idx").on(table.projectId)],
);

export const tmTicketLaborEntries = pgTable(
  "tm_ticket_labor_entries",
  {
    id: idColumn(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tmTickets.id),
    workerName: varchar("worker_name", { length: 200 }).notNull(),
    trade: varchar("trade", { length: 100 }),
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
    rate: numeric("rate", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [index("tm_ticket_labor_entries_ticket_id_idx").on(table.ticketId)],
);

export const tmTicketEquipmentEntries = pgTable(
  "tm_ticket_equipment_entries",
  {
    id: idColumn(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tmTickets.id),
    description: varchar("description", { length: 300 }).notNull(),
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
    rate: numeric("rate", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [index("tm_ticket_equipment_entries_ticket_id_idx").on(table.ticketId)],
);

export const tmTicketMaterialEntries = pgTable(
  "tm_ticket_material_entries",
  {
    id: idColumn(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tmTickets.id),
    description: varchar("description", { length: 300 }).notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    unit: varchar("unit", { length: 50 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [index("tm_ticket_material_entries_ticket_id_idx").on(table.ticketId)],
);

export const correspondenceDirectionEnum = pgEnum("correspondence_direction", ["incoming", "outgoing"]);
export const correspondenceTypeEnum = pgEnum("correspondence_type", ["letter", "notice", "transmittal", "memo"]);
export const correspondenceStatusEnum = pgEnum("correspondence_status", ["draft", "sent", "acknowledged", "closed"]);

/** A formal project record -- letters, notices, transmittals, memos -- between companies on a project. Not a replacement for RFI/submittal workflows, which stay their own modules. */
export const correspondence = pgTable(
  "correspondence",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    correspondenceNumber: varchar("correspondence_number", { length: 20 }).notNull(),
    direction: correspondenceDirectionEnum("direction").notNull(),
    type: correspondenceTypeEnum("type").notNull(),
    subject: varchar("subject", { length: 300 }).notNull(),
    body: text("body").notNull(),
    fromCompanyId: uuid("from_company_id")
      .notNull()
      .references(() => companies.id),
    toCompanyId: uuid("to_company_id")
      .notNull()
      .references(() => companies.id),
    sentDate: timestamp("sent_date", { withTimezone: false, mode: "date" }),
    responseRequiredBy: timestamp("response_required_by", { withTimezone: false, mode: "date" }),
    /** Typed-name signature the sender enters to certify/send (Phase 12) -- required at the draft->sent transition; `sentDate` doubles as the signed-at timestamp. */
    senderSignatureName: varchar("sender_signature_name", { length: 200 }),
    status: correspondenceStatusEnum("status").notNull().default("draft"),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("correspondence_project_id_idx").on(table.projectId)],
);
