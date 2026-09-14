import { z } from "zod";

/**
 * Industry-standard (AIA G810 / CSI) submittal states. "approved_as_noted",
 * "revise_resubmit", and "rejected" reuse the exact same terms as
 * submittalResponseCodeSchema below (the standard four reviewer actions) so
 * the submittal's own top-level status can reflect *which* of those a
 * completed review round landed on, instead of collapsing every
 * non-fully-passing outcome into a generic "in_review".
 */
export const submittalStatusSchema = z.enum([
  "draft",
  "in_review",
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
  "closed",
]);
export type SubmittalStatus = z.infer<typeof submittalStatusSchema>;

export const submittalResponseCodeSchema = z.enum([
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
]);
export type SubmittalResponseCode = z.infer<typeof submittalResponseCodeSchema>;

/** Procore's standard submittal type categories (CSI/AIA). */
export const submittalTypeSchema = z.enum([
  "shop_drawings",
  "product_data",
  "samples",
  "design_data",
  "test_reports",
  "certificates",
  "manufacturer_instructions",
  "manufacturer_field_reports",
  "operation_maintenance_data",
  "other",
]);
export type SubmittalType = z.infer<typeof submittalTypeSchema>;

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
    submittalType: submittalTypeSchema.default("shop_drawings"),
    leadTimeDays: z.number().int().positive().optional(),
    requiredOnSiteDate: z.string().date().optional(),
    /** Who owns this submittal before any review round exists to drive it automatically -- see submittal.service.ts's initialBallInCourt/nextBallInCourt. */
    ballInCourtUserId: z.string().uuid().optional(),
    /** The company responsible for furnishing this submittal -- Procore's "Responsible Contractor" field. */
    responsibleContractorCompanyId: z.string().uuid().optional(),
    location: z.string().max(200).optional(),
    /** Free-text: who this submittal was received from -- Procore's "Received From" field. */
    receivedFrom: z.string().max(200).optional(),
    /** Procore's Final Due Date: when the current ball-in-court response is expected. */
    dueDate: z.string().date().optional(),
    /** Restricts visibility the same way rfi.schema.ts's isPrivate does -- see submittal.service.ts's canViewPrivateSubmittal. */
    isPrivate: z.boolean().default(false),
    /** Additional personnel beyond the single ballInCourtUserId -- mirrors rfi.schema.ts's distribution fields. */
    distributionUserIds: z.array(z.string().uuid()).max(50).default([]),
    distributionCompanyIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();
export type CreateSubmittalInput = z.infer<typeof createSubmittalSchema>;

export const updateSubmittalSchema = createSubmittalSchema
  .omit({ projectId: true, specSectionId: true, distributionUserIds: true, distributionCompanyIds: true })
  .partial()
  .strict();
export type UpdateSubmittalInput = z.infer<typeof updateSubmittalSchema>;

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
