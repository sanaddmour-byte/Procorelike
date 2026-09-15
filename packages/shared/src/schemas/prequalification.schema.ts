import { z } from "zod";

export const prequalificationStatusSchema = z.enum(["invited", "submitted", "under_review", "qualified", "disqualified"]);
export type PrequalificationStatus = z.infer<typeof prequalificationStatusSchema>;

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
