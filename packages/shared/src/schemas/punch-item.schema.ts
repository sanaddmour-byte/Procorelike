import { z } from "zod";

export const punchItemPrioritySchema = z.enum(["low", "medium", "high"]);
export const punchItemStatusSchema = z.enum(["open", "ready_for_review", "approved", "closed"]);
export type PunchItemPriority = z.infer<typeof punchItemPrioritySchema>;
export type PunchItemStatus = z.infer<typeof punchItemStatusSchema>;

export const createPunchItemSchema = z
  .object({
    projectId: z.string().uuid(),
    description: z.string().min(1).max(2000),
    locationId: z.string().uuid().optional(),
    assigneeUserId: z.string().uuid().optional(),
    assigneeCompanyId: z.string().uuid().optional(),
    tradeId: z.string().uuid().optional(),
    priority: punchItemPrioritySchema.default("medium"),
    dueDate: z.string().datetime().optional(),
    /** Additional personnel beyond the single assigneeUserId -- mirrors rfi.schema.ts's distribution fields. */
    distributionUserIds: z.array(z.string().uuid()).max(50).default([]),
    distributionCompanyIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();
export type CreatePunchItemInput = z.infer<typeof createPunchItemSchema>;

export const updatePunchItemSchema = createPunchItemSchema
  .omit({ projectId: true, distributionUserIds: true, distributionCompanyIds: true })
  .partial()
  .strict();
export type UpdatePunchItemInput = z.infer<typeof updatePunchItemSchema>;

export const transitionPunchItemStatusSchema = z
  .object({
    toStatus: punchItemStatusSchema,
    note: z.string().max(2000).optional(),
  })
  .strict();
export type TransitionPunchItemStatusInput = z.infer<typeof transitionPunchItemStatusSchema>;

/** Valid forward transitions — enforced server-side, not just in the UI. */
export const PUNCH_ITEM_STATUS_TRANSITIONS: Record<
  z.infer<typeof punchItemStatusSchema>,
  readonly z.infer<typeof punchItemStatusSchema>[]
> = {
  open: ["ready_for_review"],
  ready_for_review: ["approved", "open"],
  approved: ["closed", "open"],
  closed: [],
};
