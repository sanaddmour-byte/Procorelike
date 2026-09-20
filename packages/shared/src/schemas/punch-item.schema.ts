import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

export const punchItemPrioritySchema = z.enum(["low", "medium", "high"]);
export const punchItemStatusSchema = z.enum(["open", "ready_for_review", "not_accepted", "in_dispute", "approved", "closed"]);
export type PunchItemPriority = z.infer<typeof punchItemPrioritySchema>;
export type PunchItemStatus = z.infer<typeof punchItemStatusSchema>;

export const PUNCH_ITEM_SORT_KEYS = ["number", "description", "status", "priority", "dueDate"] as const;
export type PunchItemSortKey = (typeof PUNCH_ITEM_SORT_KEYS)[number];

/** GET /punch-items's query contract (Phase 22, same shape as rfi.schema.ts's listRfisQuerySchema from Phase 21). Search matches description (punch items have no separate title field) and number. */
export const listPunchItemsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(PUNCH_ITEM_SORT_KEYS).optional(),
    status: punchItemStatusSchema.optional(),
    assigneeUserId: z.string().uuid().optional(),
  })
  .strict();
export type ListPunchItemsQuery = z.infer<typeof listPunchItemsQuerySchema>;

export const createPunchItemSchema = z
  .object({
    projectId: z.string().uuid(),
    description: z.string().min(1).max(2000),
    locationId: z.string().uuid().optional(),
    assigneeUserId: z.string().uuid().optional(),
    assigneeCompanyId: z.string().uuid().optional(),
    /** Procore's Final Approver role: distinct from the assignee -- required to move a punch item to "approved". */
    finalApproverUserId: z.string().uuid().optional(),
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

/** Phase 31: bulk-transition contract, same shape as rfi.schema.ts's bulkTransitionRfiStatusSchema (Phase 28). No `note` field -- a bulk action applying one note to N distinct items reads as generic filler rather than a real per-item note, so it's left out rather than force-fit. */
export const bulkTransitionPunchItemStatusSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(100),
    toStatus: punchItemStatusSchema,
  })
  .strict();
export type BulkTransitionPunchItemStatusInput = z.infer<typeof bulkTransitionPunchItemStatusSchema>;

/**
 * Valid forward transitions — enforced server-side, not just in the UI.
 * Mirrors Procore's Punch List Workflow: a reviewer can send an item back
 * as "Not Accepted" (needs more work) or "In Dispute" (contested) instead
 * of approving it outright, both of which route back into review once
 * resolved.
 */
export const PUNCH_ITEM_STATUS_TRANSITIONS: Record<
  z.infer<typeof punchItemStatusSchema>,
  readonly z.infer<typeof punchItemStatusSchema>[]
> = {
  open: ["ready_for_review"],
  ready_for_review: ["approved", "not_accepted", "in_dispute", "open"],
  not_accepted: ["ready_for_review", "open"],
  in_dispute: ["ready_for_review", "open"],
  approved: ["closed", "open"],
  closed: [],
};
