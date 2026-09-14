import { z } from "zod";

export const createDrawingSchema = z
  .object({
    projectId: z.string().uuid(),
    sheetNumber: z.string().min(1).max(50),
    discipline: z.string().min(1).max(100),
    title: z.string().min(1).max(300),
  })
  .strict();
export type CreateDrawingInput = z.infer<typeof createDrawingSchema>;

export const updateDrawingSchema = createDrawingSchema.omit({ projectId: true }).partial().strict();
export type UpdateDrawingInput = z.infer<typeof updateDrawingSchema>;

/**
 * Revision codes are owner-supplied free text (e.g. "A", "1", "Rev-2"), not
 * server-generated — see docs/DATA_MODEL.md §12: they're often contractually
 * specified upstream, not ours to assign.
 */
export const createDrawingRevisionSchema = z
  .object({
    revisionCode: z.string().min(1).max(50),
    attachmentId: z.string().uuid(),
    issuedDate: z.string().date(),
  })
  .strict();
export type CreateDrawingRevisionInput = z.infer<typeof createDrawingRevisionSchema>;

export const createMarkupSchema = z
  .object({
    /** Anchored to sheet coordinates — a single pin `{ type: "pin", x, y }`, an outline `{ type: "polygon", points: [[x,y], ...] }`, or a freehand redline stroke `{ type: "freehand", points: [[x,y], ...], color }` — all normalized 0-1 against the rendered page so they survive different viewer zoom levels/resolutions. */
    coords: z.union([
      z.object({ type: z.literal("pin"), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
      z
        .object({
          type: z.literal("polygon"),
          points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(3),
        })
        .strict(),
      z
        .object({
          type: z.literal("freehand"),
          points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(2).max(2000),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .default("#dc2626"),
        })
        .strict(),
    ]),
    note: z.string().max(2000).optional(),
  })
  .strict();
export type CreateMarkupInput = z.infer<typeof createMarkupSchema>;
