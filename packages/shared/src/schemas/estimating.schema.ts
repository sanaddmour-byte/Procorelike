import { z } from "zod";

export const estimateStatusSchema = z.enum(["draft", "final"]);
export type EstimateStatus = z.infer<typeof estimateStatusSchema>;

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
