import { z } from "zod";

/** The closed set of record types the in-app PDF previewer (PdfViewerModal) renders a report for. */
export const pdfCommentRecordTypeSchema = z.enum(["rfi", "submittal", "change_order", "correspondence", "inspection"]);
export type PdfCommentRecordType = z.infer<typeof pdfCommentRecordTypeSchema>;

export const createPdfCommentSchema = z
  .object({
    projectId: z.string().uuid(),
    recordType: pdfCommentRecordTypeSchema,
    recordId: z.string().uuid(),
    pageNumber: z.number().int().min(1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    commentText: z.string().min(1).max(2000),
    linkedRfiId: z.string().uuid().optional(),
  })
  .strict();
export type CreatePdfCommentInput = z.infer<typeof createPdfCommentSchema>;

export const linkPdfCommentToRfiSchema = z
  .object({
    linkedRfiId: z.string().uuid().nullable(),
  })
  .strict();
export type LinkPdfCommentToRfiInput = z.infer<typeof linkPdfCommentToRfiSchema>;
