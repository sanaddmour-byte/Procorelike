import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

export const DRAWING_SORT_KEYS = ["sheetNumber", "title", "discipline"] as const;
export type DrawingSortKey = (typeof DRAWING_SORT_KEYS)[number];

/** GET /drawings's query contract (Phase 23, same shape as rfi.schema.ts's listRfisQuerySchema from Phase 21). */
export const listDrawingsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(DRAWING_SORT_KEYS).optional(),
    discipline: z.string().max(100).optional(),
  })
  .strict();
export type ListDrawingsQuery = z.infer<typeof listDrawingsQuerySchema>;

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

const normalized = z.number().min(0).max(1);
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .default("#dc2626");

/**
 * Anchored to sheet coordinates — all normalized 0-1 against the rendered
 * page so they survive different viewer zoom levels/resolutions. Beyond the
 * original pin/polygon/freehand set, this covers Procore's other standard
 * markup shapes: revision cloud (scalloped outline), box, ellipse, arrow,
 * line, text callout, and a measurement line (its "distance" is reported as
 * a fraction of the page diagonal, since the app has no per-drawing
 * real-world scale calibration -- a print-scale-aware distance is future
 * work, tracked alongside OCR sheet-detection and true revision-image-diff
 * as the larger Drawings gaps still open against Procore's tool).
 */
export const createMarkupSchema = z
  .object({
    coords: z.union([
      z.object({ type: z.literal("pin"), x: normalized, y: normalized }).strict(),
      z
        .object({
          type: z.literal("polygon"),
          points: z.array(z.tuple([normalized, normalized])).min(3),
        })
        .strict(),
      z
        .object({
          type: z.literal("freehand"),
          points: z.array(z.tuple([normalized, normalized])).min(2).max(2000),
          color: hexColor,
        })
        .strict(),
      z
        .object({
          type: z.literal("cloud"),
          points: z.array(z.tuple([normalized, normalized])).min(3).max(200),
          color: hexColor,
        })
        .strict(),
      z
        .object({
          type: z.literal("box"),
          x: normalized,
          y: normalized,
          width: normalized,
          height: normalized,
          color: hexColor,
        })
        .strict(),
      z
        .object({
          type: z.literal("ellipse"),
          cx: normalized,
          cy: normalized,
          rx: normalized,
          ry: normalized,
          color: hexColor,
        })
        .strict(),
      z
        .object({
          type: z.literal("arrow"),
          x1: normalized,
          y1: normalized,
          x2: normalized,
          y2: normalized,
          color: hexColor,
        })
        .strict(),
      z
        .object({
          type: z.literal("line"),
          x1: normalized,
          y1: normalized,
          x2: normalized,
          y2: normalized,
          color: hexColor,
        })
        .strict(),
      z
        .object({
          type: z.literal("text"),
          x: normalized,
          y: normalized,
          text: z.string().min(1).max(200),
          color: hexColor,
        })
        .strict(),
      z
        .object({
          type: z.literal("measurement"),
          x1: normalized,
          y1: normalized,
          x2: normalized,
          y2: normalized,
          color: hexColor,
        })
        .strict(),
    ]),
    note: z.string().max(2000).optional(),
  })
  .strict();
export type CreateMarkupInput = z.infer<typeof createMarkupSchema>;
export type MarkupCoordsInput = CreateMarkupInput["coords"];
