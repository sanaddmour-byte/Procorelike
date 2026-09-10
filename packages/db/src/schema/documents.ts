import { boolean, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { attachments, projects, users } from "./core";

export const documentFolders = pgTable("document_folders", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  parentId: uuid("parent_id"),
  name: varchar("name", { length: 200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  folderId: uuid("folder_id").references(() => documentFolders.id),
  title: varchar("title", { length: 300 }).notNull(),
  currentAttachmentId: uuid("current_attachment_id").references(() => attachments.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  ...auditColumns(),
});

export const drawings = pgTable("drawings", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  sheetNumber: varchar("sheet_number", { length: 50 }).notNull(),
  discipline: varchar("discipline", { length: 100 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  currentRevisionId: uuid("current_revision_id"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  ...auditColumns(),
});

export const drawingRevisions = pgTable("drawing_revisions", {
  id: idColumn(),
  drawingId: uuid("drawing_id")
    .notNull()
    .references(() => drawings.id),
  revisionCode: varchar("revision_code", { length: 50 }).notNull(),
  attachmentId: uuid("attachment_id")
    .notNull()
    .references(() => attachments.id),
  issuedDate: timestamp("issued_date", { withTimezone: true }).notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  offlineAvailable: boolean("offline_available").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const markups = pgTable("markups", {
  id: idColumn(),
  drawingRevisionId: uuid("drawing_revision_id")
    .notNull()
    .references(() => drawingRevisions.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  /** { type: "pin" | "polygon", coords: number[] } anchored to sheet coordinates. */
  coords: jsonb("coords").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
