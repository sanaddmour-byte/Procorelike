import { z } from "zod";

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
