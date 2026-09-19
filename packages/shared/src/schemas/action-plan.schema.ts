import { z } from "zod";
import { correctiveActionSourceTypeSchema } from "./corrective-action.schema";

export const createActionPlanTemplateSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
  })
  .strict();
export type CreateActionPlanTemplateInput = z.infer<typeof createActionPlanTemplateSchema>;

export const updateActionPlanTemplateSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).optional(),
  })
  .strict();
export type UpdateActionPlanTemplateInput = z.infer<typeof updateActionPlanTemplateSchema>;

export const deleteActionPlanTemplateSchema = z.object({ projectId: z.string().uuid() }).strict();
export type DeleteActionPlanTemplateInput = z.infer<typeof deleteActionPlanTemplateSchema>;

export const createActionPlanTemplateItemSchema = z
  .object({
    projectId: z.string().uuid(),
    description: z.string().min(1).max(2000),
    /** A UI hint only -- "due in N days from today" -- never enforced server-side; instantiation always takes an explicit due date per item. */
    defaultDueDays: z.number().int().min(0).max(365).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type CreateActionPlanTemplateItemInput = z.infer<typeof createActionPlanTemplateItemSchema>;

export const updateActionPlanTemplateItemSchema = z
  .object({
    projectId: z.string().uuid(),
    description: z.string().min(1).max(2000).optional(),
    defaultDueDays: z.number().int().min(0).max(365).nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type UpdateActionPlanTemplateItemInput = z.infer<typeof updateActionPlanTemplateItemSchema>;

export const deleteActionPlanTemplateItemSchema = z.object({ projectId: z.string().uuid() }).strict();
export type DeleteActionPlanTemplateItemInput = z.infer<typeof deleteActionPlanTemplateItemSchema>;

const instantiateActionPlanItemSchema = z
  .object({
    description: z.string().min(1).max(2000),
    assignedToUserId: z.string().uuid(),
    dueDate: z.string().date(),
  })
  .strict();

/**
 * Instantiating a template (or logging an ad-hoc plan with no template)
 * takes the final, concrete item list directly -- the web client resolves
 * a template's items into pre-filled defaults client-side, but the server
 * only ever accepts the caller's confirmed description/assignee/due-date
 * per item, the same required fields createCorrectiveActionSchema already
 * has for a single one-off action.
 */
export const instantiateActionPlanSchema = z
  .object({
    projectId: z.string().uuid(),
    templateId: z.string().uuid().optional(),
    name: z.string().min(1).max(200),
    sourceType: correctiveActionSourceTypeSchema,
    sourceId: z.string().uuid(),
    items: z.array(instantiateActionPlanItemSchema).min(1).max(50),
  })
  .strict();
export type InstantiateActionPlanInput = z.infer<typeof instantiateActionPlanSchema>;
