import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn } from "./columns";
import { projects, users } from "./core";

/**
 * A freehand redline stroke drawn on a specific page of the in-app PDF
 * previewer (PdfViewerModal), generalized across record types the same way
 * pdf-comments.ts is. One row is one completed stroke (pointer-down to
 * pointer-up): points is the ordered list of normalized (0-1) coordinates
 * sampled along that stroke, rendered back as an SVG polyline. There is no
 * delete/undo, matching pdf_comments.
 */
export const pdfSketches = pgTable(
  "pdf_sketches",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    recordType: varchar("record_type", { length: 100 }).notNull(),
    recordId: uuid("record_id").notNull(),
    pageNumber: integer("page_number").notNull(),
    points: jsonb("points").notNull().$type<{ x: number; y: number }[]>(),
    color: varchar("color", { length: 7 }).notNull().default("#dc2626"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pdf_sketches_record_idx").on(table.recordType, table.recordId)],
);
