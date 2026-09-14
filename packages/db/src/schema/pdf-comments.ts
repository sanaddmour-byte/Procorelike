import { index, integer, pgTable, real, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn } from "./columns";
import { projects, users } from "./core";
import { rfis } from "./rfis";

/**
 * A pinned comment dropped on a specific spot of a page in the in-app PDF
 * previewer (PdfViewerModal) -- generalized across every record type that
 * previewer renders (rfi/submittal/change_order/correspondence/inspection),
 * the same way record_links generalizes across record types. Unlike
 * record_links, recordType here is a closed, small set (the previewer's
 * report generators), so it's kept as a plain varchar checked in the
 * service layer rather than a separate enum per type.
 *
 * The previewed PDF itself is generated fresh from live data on every open
 * (see apps/api/src/lib/*-report.ts) rather than stored -- there is no
 * attachment row to anchor a comment to. Coordinates are normalized (0-1)
 * per page, matching how markups.ts anchors pins to a drawing sheet, so a
 * comment still lands in the right spot as long as that page's layout is
 * unchanged.
 */
export const pdfComments = pgTable(
  "pdf_comments",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    recordType: varchar("record_type", { length: 100 }).notNull(),
    recordId: uuid("record_id").notNull(),
    pageNumber: integer("page_number").notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
    commentText: text("comment_text").notNull(),
    /** Optional: this comment refers to an existing RFI (e.g. "see RFI-0042 for the resolution"). */
    linkedRfiId: uuid("linked_rfi_id").references(() => rfis.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pdf_comments_record_idx").on(table.recordType, table.recordId),
    index("pdf_comments_linked_rfi_idx").on(table.linkedRfiId),
  ],
);
