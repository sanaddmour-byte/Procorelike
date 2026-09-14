import { z } from "zod";

export const correctiveActionSourceTypeSchema = z.enum(["safety_incident", "safety_observation", "inspection"]);
export type CorrectiveActionSourceType = z.infer<typeof correctiveActionSourceTypeSchema>;

export const correctiveActionStatusSchema = z.enum(["open", "in_progress", "completed", "verified"]);
export type CorrectiveActionStatus = z.infer<typeof correctiveActionStatusSchema>;

export const createCorrectiveActionSchema = z
  .object({
    projectId: z.string().uuid(),
    sourceType: correctiveActionSourceTypeSchema,
    sourceId: z.string().uuid(),
    description: z.string().min(1).max(4000),
    assignedToUserId: z.string().uuid(),
    dueDate: z.string().date(),
  })
  .strict();
export type CreateCorrectiveActionInput = z.infer<typeof createCorrectiveActionSchema>;

export const transitionCorrectiveActionStatusSchema = z
  .object({
    toStatus: correctiveActionStatusSchema,
  })
  .strict();
export type TransitionCorrectiveActionStatusInput = z.infer<typeof transitionCorrectiveActionStatusSchema>;

/**
 * open -> in_progress -> completed -> verified is the normal path (the
 * assignee works and completes it, then someone else -- typically the
 * reporter or a safety admin -- verifies it actually holds). Any of the
 * first three can also be reopened back to "open" if the fix didn't stick;
 * a verified action is the one dead end, matching Procore's own model
 * where re-verification means logging a new corrective action.
 */
export const CORRECTIVE_ACTION_STATUS_TRANSITIONS: Record<CorrectiveActionStatus, readonly CorrectiveActionStatus[]> = {
  open: ["in_progress", "completed"],
  in_progress: ["completed", "open"],
  completed: ["verified", "open"],
  verified: [],
};
