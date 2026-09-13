import { z } from "zod";

export const correspondenceDirectionSchema = z.enum(["incoming", "outgoing"]);
export type CorrespondenceDirection = z.infer<typeof correspondenceDirectionSchema>;

export const correspondenceTypeSchema = z.enum(["letter", "notice", "transmittal", "memo"]);
export type CorrespondenceType = z.infer<typeof correspondenceTypeSchema>;

export const correspondenceStatusSchema = z.enum(["draft", "sent", "acknowledged", "closed"]);
export type CorrespondenceStatus = z.infer<typeof correspondenceStatusSchema>;

export const createCorrespondenceSchema = z
  .object({
    projectId: z.string().uuid(),
    direction: correspondenceDirectionSchema,
    type: correspondenceTypeSchema,
    subject: z.string().min(1).max(300),
    body: z.string().min(1),
    fromCompanyId: z.string().uuid(),
    toCompanyId: z.string().uuid(),
    responseRequiredBy: z.string().date().optional(),
  })
  .strict();
export type CreateCorrespondenceInput = z.infer<typeof createCorrespondenceSchema>;

export const transitionCorrespondenceStatusSchema = z
  .object({
    toStatus: correspondenceStatusSchema,
  })
  .strict();
export type TransitionCorrespondenceStatusInput = z.infer<typeof transitionCorrespondenceStatusSchema>;

/** Sent can be acknowledged or closed directly (not every letter needs a formal acknowledgment); closed can reopen back to sent if follow-up is needed. */
export const CORRESPONDENCE_STATUS_TRANSITIONS: Record<CorrespondenceStatus, readonly CorrespondenceStatus[]> = {
  draft: ["sent"],
  sent: ["acknowledged", "closed"],
  acknowledged: ["closed"],
  closed: ["sent"],
};
