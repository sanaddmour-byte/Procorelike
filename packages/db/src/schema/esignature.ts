import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn } from "./columns";
import { projects, users } from "./core";

export const esignatureDocumentTypeEnum = pgEnum("esignature_document_type", ["correspondence", "inspection"]);

/**
 * A real, verifiable e-signature, generalized across document types the same
 * way pdf-comments/pdf-sketches are. Unlike the typed-name-only
 * `senderSignatureName`/`signedByName` columns these replace in spirit (kept
 * in place for display/back-compat), a row here freezes a sha256 hash of the
 * exact content signed (`contentHash`, computed by
 * @siteops/shared's computeContentHash) alongside an optional drawn
 * signature image -- so a signature can be re-verified later by recomputing
 * the hash from the document's current state and comparing, rather than
 * just trusting a stored string. There is no update/delete: signing again
 * (e.g. correspondence's closed -> sent reopen-and-resend) inserts a new
 * row, and callers read the most recent one per document.
 */
export const esignatures = pgTable(
  "esignatures",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    documentType: esignatureDocumentTypeEnum("document_type").notNull(),
    documentId: uuid("document_id").notNull(),
    signerUserId: uuid("signer_user_id")
      .notNull()
      .references(() => users.id),
    signerName: varchar("signer_name", { length: 200 }).notNull(),
    /** Raw base64 PNG drawn on a canvas signature pad -- optional so a client that can't draw yet (e.g. a future offline mobile path) can still sign with just the typed name. */
    signatureImageBase64: text("signature_image_base64"),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("esignatures_document_idx").on(table.documentType, table.documentId),
    index("esignatures_project_id_idx").on(table.projectId),
  ],
);
