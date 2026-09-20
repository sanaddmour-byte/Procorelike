import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

export const prequalificationStatusSchema = z.enum(["invited", "submitted", "under_review", "qualified", "disqualified"]);
export type PrequalificationStatus = z.infer<typeof prequalificationStatusSchema>;

export const PREQUALIFICATION_SORT_KEYS = ["company", "status", "overallScore"] as const;
export type PrequalificationSortKey = (typeof PREQUALIFICATION_SORT_KEYS)[number];

/** GET /prequalifications's query contract (Phase 25). A prequalification record carries no title of its own -- both search and the `company` sort key operate on the joined companies.name, the same join-for-search-and-sort treatment Inspections gave checklist_templates.title in Phase 24 and Payment Applications gives commitments.number/title, since there is no other plain text column on this table to search instead. */
export const listPrequalificationsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(PREQUALIFICATION_SORT_KEYS).optional(),
    status: prequalificationStatusSchema.optional(),
  })
  .strict();
export type ListPrequalificationsQuery = z.infer<typeof listPrequalificationsQuerySchema>;

/** A disqualified company can be sent back to review (e.g. to reconsider on updated financials); qualified is otherwise terminal for this pass. */
export const PREQUALIFICATION_STATUS_TRANSITIONS: Record<PrequalificationStatus, readonly PrequalificationStatus[]> = {
  invited: ["submitted"],
  submitted: ["under_review"],
  under_review: ["qualified", "disqualified"],
  qualified: [],
  disqualified: ["under_review"],
};

export const invitePrequalificationSchema = z
  .object({
    projectId: z.string().uuid(),
    companyId: z.string().uuid(),
  })
  .strict();
export type InvitePrequalificationInput = z.infer<typeof invitePrequalificationSchema>;

/** Submitted by (or on behalf of) the invited company -- the fields Procore's own prequalification form asks for. */
export const submitPrequalificationSchema = z
  .object({
    bondingCapacity: z.number().nonnegative().optional(),
    experienceModRate: z.number().nonnegative().optional(),
    annualRevenue: z.number().nonnegative().optional(),
    yearsInBusiness: z.number().int().nonnegative().optional(),
    referencesText: z.string().max(5000).optional(),
  })
  .strict();
export type SubmitPrequalificationInput = z.infer<typeof submitPrequalificationSchema>;

/** `overallScore`/`reviewNotes` are only meaningful (and only accepted) on the under_review -> qualified/disqualified decision -- a reviewer's own judgment call, not required for the earlier invited/submitted moves. */
export const transitionPrequalificationStatusSchema = z
  .object({
    toStatus: prequalificationStatusSchema,
    overallScore: z.number().min(0).max(100).optional(),
    reviewNotes: z.string().max(5000).optional(),
  })
  .strict();
export type TransitionPrequalificationStatusInput = z.infer<typeof transitionPrequalificationStatusSchema>;
