import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { companies, projects, users } from "./core";
import { drawingRevisions } from "./documents";

/** Procore's transmittal purposes -- what the recipient is expected to do with the enclosed items. */
export const transmittalPurposeEnum = pgEnum("transmittal_purpose", [
  "for_review",
  "for_approval",
  "for_information",
  "as_requested",
  "for_construction",
  "for_bid",
]);

export const transmittalStatusEnum = pgEnum("transmittal_status", ["draft", "sent"]);

/** A transmittal item points at an existing document/drawing revision/drawing set rather than duplicating it -- description is a point-in-time snapshot (e.g. the sheet title) so the transmittal record still reads correctly even if the source item is later renamed. */
export const transmittalItemTypeEnum = pgEnum("transmittal_item_type", ["document", "drawing_revision", "drawing_set"]);

export const transmittals = pgTable(
  "transmittals",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    transmittalNumber: varchar("transmittal_number", { length: 20 }).notNull(),
    subject: varchar("subject", { length: 300 }).notNull(),
    purpose: transmittalPurposeEnum("purpose").notNull(),
    message: text("message"),
    status: transmittalStatusEnum("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("transmittals_project_id_idx").on(table.projectId)],
);

export const transmittalItems = pgTable(
  "transmittal_items",
  {
    id: idColumn(),
    transmittalId: uuid("transmittal_id")
      .notNull()
      .references(() => transmittals.id),
    itemType: transmittalItemTypeEnum("item_type").notNull(),
    itemId: uuid("item_id").notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("transmittal_items_transmittal_id_idx").on(table.transmittalId)],
);

/** Mirrors rfiDistribution's userId-or-companyId shape; acknowledgedAt tracks Procore's "recipient confirmed receipt" per-recipient, not just "the transmittal was sent". */
export const transmittalRecipients = pgTable(
  "transmittal_recipients",
  {
    id: idColumn(),
    transmittalId: uuid("transmittal_id")
      .notNull()
      .references(() => transmittals.id),
    userId: uuid("user_id").references(() => users.id),
    companyId: uuid("company_id").references(() => companies.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("transmittal_recipients_transmittal_id_idx").on(table.transmittalId)],
);

/** Procore's Drawing Sets: a named, dated bundle of sheet revisions published together (e.g. "Issued for Construction, Set 3") -- distinct from superseding one sheet at a time. */
export const drawingSets = pgTable(
  "drawing_sets",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: varchar("name", { length: 200 }).notNull(),
    publishedDate: timestamp("published_date", { withTimezone: false, mode: "date" }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("drawing_sets_project_id_idx").on(table.projectId)],
);

export const drawingSetItems = pgTable(
  "drawing_set_items",
  {
    id: idColumn(),
    drawingSetId: uuid("drawing_set_id")
      .notNull()
      .references(() => drawingSets.id),
    drawingRevisionId: uuid("drawing_revision_id")
      .notNull()
      .references(() => drawingRevisions.id),
  },
  (table) => [index("drawing_set_items_drawing_set_id_idx").on(table.drawingSetId)],
);
