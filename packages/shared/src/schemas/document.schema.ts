import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

export const DOCUMENT_SORT_KEYS = ["title"] as const;
export type DocumentSortKey = (typeof DOCUMENT_SORT_KEYS)[number];

/** GET /documents's query contract (Phase 23, same shape as rfi.schema.ts's listRfisQuerySchema from Phase 21). `folderId` isn't part of this bag -- it's the essential scoping param the folder-browser UI always sends, not an optional filter, so the route keeps parsing it separately (see documents.routes.ts). */
export const listDocumentsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(DOCUMENT_SORT_KEYS).optional(),
  })
  .strict();
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const createDocumentFolderSchema = z
  .object({
    projectId: z.string().uuid(),
    parentId: z.string().uuid().optional(),
    name: z.string().min(1).max(200),
  })
  .strict();
export type CreateDocumentFolderInput = z.infer<typeof createDocumentFolderSchema>;

export const createDocumentSchema = z
  .object({
    projectId: z.string().uuid(),
    folderId: z.string().uuid().optional(),
    title: z.string().min(1).max(300),
    attachmentId: z.string().uuid(),
  })
  .strict();
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

/** Replaces the document's file and/or moves/renames it — no revision history is kept for plain documents (see docs/DATA_MODEL.md §2; drawings are the entity with full revision history). */
export const updateDocumentSchema = z
  .object({
    folderId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(300).optional(),
    attachmentId: z.string().uuid().optional(),
  })
  .strict();
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
