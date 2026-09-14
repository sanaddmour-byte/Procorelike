import { z } from "zod";
import { pdfCommentRecordTypeSchema } from "./pdf-comment.schema";

/** Normalized (0-1) coordinate sampled along a freehand stroke. */
export const pdfSketchPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type PdfSketchPoint = z.infer<typeof pdfSketchPointSchema>;

export const createPdfSketchSchema = z
  .object({
    projectId: z.string().uuid(),
    recordType: pdfCommentRecordTypeSchema,
    recordId: z.string().uuid(),
    pageNumber: z.number().int().min(1),
    points: z.array(pdfSketchPointSchema).min(2).max(2000),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#dc2626"),
  })
  .strict();
export type CreatePdfSketchInput = z.infer<typeof createPdfSketchSchema>;
