import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

export const bidPackageStatusSchema = z.enum(["draft", "open", "closed", "awarded", "canceled"]);
export type BidPackageStatus = z.infer<typeof bidPackageStatusSchema>;

export const BID_PACKAGE_SORT_KEYS = ["number", "title", "dueDate", "status"] as const;
export type BidPackageSortKey = (typeof BID_PACKAGE_SORT_KEYS)[number];

/** GET /bid-packages's query contract (Phase 26, closing out the server-driven list-query initiative -- see docs/DATA_MODEL.md §9n). No `costCode` sort key -- the list page's Cost Code column is a joined lookup by `costCodeId`, not a plain column, same shape as Direct Costs'/Commitments' joined columns; `number`/`title` already give this module a real search/sort surface, so this wasn't judged worth a join. */
export const listBidPackagesQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(BID_PACKAGE_SORT_KEYS).optional(),
    status: bidPackageStatusSchema.optional(),
  })
  .strict();
export type ListBidPackagesQuery = z.infer<typeof listBidPackagesQuerySchema>;

export const BID_PACKAGE_STATUS_TRANSITIONS: Record<BidPackageStatus, readonly BidPackageStatus[]> = {
  draft: ["open"],
  open: ["closed"],
  closed: ["awarded", "canceled"],
  awarded: [],
  canceled: [],
};

export const bidInvitationStatusSchema = z.enum(["invited", "viewing", "declined", "submitted"]);
export type BidInvitationStatus = z.infer<typeof bidInvitationStatusSchema>;

export const bidStatusSchema = z.enum(["submitted", "shortlisted", "awarded", "rejected"]);
export type BidStatus = z.infer<typeof bidStatusSchema>;

export const createBidPackageSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().min(1).max(300),
    description: z.string().max(5000).optional(),
    costCodeId: z.string().uuid().optional(),
    dueDate: z.string().date().optional(),
  })
  .strict();
export type CreateBidPackageInput = z.infer<typeof createBidPackageSchema>;

export const transitionBidPackageStatusSchema = z
  .object({
    toStatus: bidPackageStatusSchema,
  })
  .strict();
export type TransitionBidPackageStatusInput = z.infer<typeof transitionBidPackageStatusSchema>;

export const inviteBidderSchema = z
  .object({
    companyId: z.string().uuid(),
  })
  .strict();
export type InviteBidderInput = z.infer<typeof inviteBidderSchema>;

const bidAlternateSchema = z.object({
  description: z.string().min(1).max(300),
  amount: z.number(),
});

/** Logged by a GC-side user on the bidder's behalf -- see bids table doc comment for why there's no self-service bidder submission in this pass. */
export const logBidSchema = z
  .object({
    companyId: z.string().uuid(),
    amount: z.number(),
    alternates: z.array(bidAlternateSchema).max(50).default([]),
    exclusions: z.string().max(5000).optional(),
  })
  .strict();
export type LogBidInput = z.infer<typeof logBidSchema>;

/** Awarding a bid closes the package, rejects every other submitted/shortlisted bid on it, and can optionally spin up a Commitment in the same step (Procore's own Bid Package -> Award -> Commitment flow). */
export const awardBidSchema = z
  .object({
    createCommitment: z.boolean().default(false),
  })
  .strict();
export type AwardBidInput = z.infer<typeof awardBidSchema>;
