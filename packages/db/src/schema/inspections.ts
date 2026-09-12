import { integer, jsonb, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn, syncColumns } from "./columns";
import { attachments, locations, projects, users } from "./core";
import { punchItems } from "./punch-list";

export const checklistResponseTypeEnum = pgEnum("checklist_response_type", [
  "pass_fail",
  "na",
  "numeric",
  "photo",
  "signature",
]);

export const inspectionStatusEnum = pgEnum("inspection_status", [
  "scheduled",
  "in_progress",
  "completed",
]);

export const checklistTemplates = pgTable("checklist_templates", {
  id: idColumn(),
  projectId: uuid("project_id").references(() => projects.id), // null = global/reusable template
  title: varchar("title", { length: 300 }).notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checklistTemplateItems = pgTable("checklist_template_items", {
  id: idColumn(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => checklistTemplates.id),
  prompt: varchar("prompt", { length: 500 }).notNull(),
  responseType: checklistResponseTypeEnum("response_type").notNull(),
  order: integer("order").notNull().default(0),
});

export const inspections = pgTable("inspections", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  templateId: uuid("template_id")
    .notNull()
    .references(() => checklistTemplates.id),
  locationId: uuid("location_id").references(() => locations.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  performedBy: uuid("performed_by").references(() => users.id),
  status: inspectionStatusEnum("status").notNull().default("scheduled"),
  /** A drawn signature image, uploaded like any other attachment — schema support for a future signature pad. No client produces one yet (docs/ROADMAP.md Phase 5 gate report): every platform signs off with the typed name below, which is what the PDF report actually renders. */
  signatureAttachmentId: uuid("signature_attachment_id").references(() => attachments.id),
  /** Typed-name signature — required to complete an inspection on every platform today. Both null until completion; both set together. */
  signedByName: varchar("signed_by_name", { length: 200 }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...auditColumns(),
  ...syncColumns(),
});

export const inspectionResponses = pgTable("inspection_responses", {
  id: idColumn(),
  inspectionId: uuid("inspection_id")
    .notNull()
    .references(() => inspections.id),
  templateItemId: uuid("template_item_id")
    .notNull()
    .references(() => checklistTemplateItems.id),
  value: jsonb("value").notNull(),
  photoAttachmentId: uuid("photo_attachment_id").references(() => attachments.id),
  generatedPunchItemId: uuid("generated_punch_item_id").references(() => punchItems.id),
});
