import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

export const rfiStatusSchema = z.enum(["draft", "open", "answered", "closed"]);
export type RfiStatus = z.infer<typeof rfiStatusSchema>;

export const RFI_SORT_KEYS = ["number", "subject", "status", "dueDate"] as const;
export type RfiSortKey = (typeof RFI_SORT_KEYS)[number];

/** GET /rfis's query contract (Phase 21): the generic search/sort/pagination shape plus this module's own filters. See list-query.schema.ts's doc comment for why every field here is optional. */
export const listRfisQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(RFI_SORT_KEYS).optional(),
    status: rfiStatusSchema.optional(),
    assigneeUserId: z.string().uuid().optional(),
  })
  .strict();
export type ListRfisQuery = z.infer<typeof listRfisQuerySchema>;

/** Matches Procore's Cost Impact / Schedule Impact fields: Yes, No, or N/A -- not a plain flag. */
export const rfiImpactSchema = z.enum(["yes", "no", "na"]);
export type RfiImpact = z.infer<typeof rfiImpactSchema>;

export const createRfiSchema = z
  .object({
    projectId: z.string().uuid(),
    subject: z.string().min(1).max(300),
    question: z.string().min(1),
    ballInCourtUserId: z.string().uuid().optional(),
    ballInCourtCompanyId: z.string().uuid().optional(),
    dueDate: z.string().date().optional(),
    costImpact: rfiImpactSchema.default("na"),
    scheduleImpact: rfiImpactSchema.default("na"),
    /** Restricts visibility to the creator, ball-in-court user, distribution list, and admin-level RFI permission -- see rfi.service.ts's canViewPrivateRfi. */
    isPrivate: z.boolean().default(false),
    /** Free-text reference tag, e.g. a spec section or drawing callout. */
    reference: z.string().max(200).optional(),
    /** Cc list at creation time — drives the subcontractor visibility rule (docs/DATA_MODEL.md §10). More recipients can be added later via a separate distribution endpoint. */
    distributionUserIds: z.array(z.string().uuid()).max(50).default([]),
    distributionCompanyIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();
export type CreateRfiInput = z.infer<typeof createRfiSchema>;

export const updateRfiSchema = createRfiSchema
  .omit({ projectId: true, distributionUserIds: true, distributionCompanyIds: true })
  .partial()
  .strict();
export type UpdateRfiInput = z.infer<typeof updateRfiSchema>;

export const createRfiResponseSchema = z
  .object({
    responseText: z.string().min(1).max(5000),
    /** An official response is the one the RFI's answer reflects — see docs/DATA_MODEL.md §3: "multiple responses; one marked official." Only the ball-in-court user or an admin-level caller may mark one official (see rfi.service.ts). */
    isOfficial: z.boolean().default(false),
  })
  .strict();
export type CreateRfiResponseInput = z.infer<typeof createRfiResponseSchema>;

export const transitionRfiStatusSchema = z
  .object({
    toStatus: rfiStatusSchema,
  })
  .strict();
export type TransitionRfiStatusInput = z.infer<typeof transitionRfiStatusSchema>;

/**
 * POST /rfis/bulk-transition's body (Phase 28, the list-page bulk-actions
 * pilot -- see docs/DATA_MODEL.md §9p). `ids` is capped at 100, matching
 * `DEFAULT_PAGE_SIZE` twice over -- a bulk action only ever targets rows
 * a user has actually selected on one page, never an unbounded set.
 * Per-id transition legality (RFI_STATUS_TRANSITIONS, workflow rules)
 * is still enforced one row at a time by the same `transitionRfiStatus`
 * a single-item PATCH uses -- this schema only shapes the request, not
 * the transition rules themselves.
 */
export const bulkTransitionRfiStatusSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(100),
    toStatus: rfiStatusSchema,
  })
  .strict();
export type BulkTransitionRfiStatusInput = z.infer<typeof bulkTransitionRfiStatusSchema>;

/** Valid forward transitions — enforced server-side. Marking an official response auto-transitions draft/open → answered (see rfi.service.ts); this table also allows that same edge for an explicit PATCH. */
export const RFI_STATUS_TRANSITIONS: Record<RfiStatus, readonly RfiStatus[]> = {
  draft: ["open"],
  open: ["answered", "closed"],
  answered: ["closed", "open"],
  closed: [],
};
