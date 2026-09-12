import { z } from "zod";

export const submittalStatusSchema = z.enum(["draft", "in_review", "approved", "closed"]);
export type SubmittalStatus = z.infer<typeof submittalStatusSchema>;

export const submittalResponseCodeSchema = z.enum([
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
]);
export type SubmittalResponseCode = z.infer<typeof submittalResponseCodeSchema>;

/** A response code that lets the submittal proceed without another revision cycle. */
export const PASSING_SUBMITTAL_RESPONSE_CODES: readonly SubmittalResponseCode[] = [
  "approved",
  "approved_as_noted",
];

export const createSubmittalSchema = z
  .object({
    projectId: z.string().uuid(),
    specSectionId: z.string().uuid(),
    title: z.string().min(1).max(300),
    leadTimeDays: z.number().int().positive().optional(),
    requiredOnSiteDate: z.string().date().optional(),
  })
  .strict();
export type CreateSubmittalInput = z.infer<typeof createSubmittalSchema>;

export const reviewerAssignmentSchema = z
  .object({
    reviewerUserId: z.string().uuid(),
    /** Ignored when isParallel is true — parallel reviewers don't block on order (docs/DATA_MODEL.md §4). */
    sequenceOrder: z.number().int().min(1).default(1),
    isParallel: z.boolean().default(false),
  })
  .strict();
export type ReviewerAssignmentInput = z.infer<typeof reviewerAssignmentSchema>;

export const createSubmittalRevisionSchema = z
  .object({
    attachmentId: z.string().uuid(),
    submittedDate: z.string().date(),
    reviewers: z.array(reviewerAssignmentSchema).min(1).max(20),
  })
  .strict();
export type CreateSubmittalRevisionInput = z.infer<typeof createSubmittalRevisionSchema>;

export const submitSubmittalReviewSchema = z
  .object({
    responseCode: submittalResponseCodeSchema,
  })
  .strict();
export type SubmitSubmittalReviewInput = z.infer<typeof submitSubmittalReviewSchema>;
