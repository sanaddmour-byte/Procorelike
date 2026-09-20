import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

export const estimateStatusSchema = z.enum(["draft", "final"]);
export type EstimateStatus = z.infer<typeof estimateStatusSchema>;

export const ESTIMATE_SORT_KEYS = ["number", "title", "status"] as const;
export type EstimateSortKey = (typeof ESTIMATE_SORT_KEYS)[number];

/** GET /estimates's query contract (Phase 26, closing out the server-driven list-query initiative -- see docs/DATA_MODEL.md §9n). Every list-page column here is a plain estimates column, so no joined-field exclusion is needed. */
export const listEstimatesQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(ESTIMATE_SORT_KEYS).optional(),
    status: estimateStatusSchema.optional(),
  })
  .strict();
export type ListEstimatesQuery = z.infer<typeof listEstimatesQuerySchema>;

export const createEstimateSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().min(1).max(300),
  })
  .strict();
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;

export const createEstimateLineItemSchema = z
  .object({
    costCodeId: z.string().uuid(),
    description: z.string().min(1).max(300),
    quantity: z.number().positive(),
    unit: z.string().min(1).max(50),
    unitCost: z.number().nonnegative(),
  })
  .strict();
export type CreateEstimateLineItemInput = z.infer<typeof createEstimateLineItemSchema>;
