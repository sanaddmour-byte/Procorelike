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

/** `senderSignatureName` is required exactly when moving to "sent" -- a formal letter/notice/transmittal/memo can't go out unsigned (Phase 12). It's the sender typing their own name to certify/send, not a drawn signature. */
export const transitionCorrespondenceStatusSchema = z
  .object({
    toStatus: correspondenceStatusSchema,
    senderSignatureName: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((data) => data.toStatus !== "sent" || Boolean(data.senderSignatureName?.trim()), {
    message: "senderSignatureName is required when sending correspondence",
    path: ["senderSignatureName"],
  });
export type TransitionCorrespondenceStatusInput = z.infer<typeof transitionCorrespondenceStatusSchema>;

/** Sent can be acknowledged or closed directly (not every letter needs a formal acknowledgment); closed can reopen back to sent if follow-up is needed. */
export const CORRESPONDENCE_STATUS_TRANSITIONS: Record<CorrespondenceStatus, readonly CorrespondenceStatus[]> = {
  draft: ["sent"],
  sent: ["acknowledged", "closed"],
  acknowledged: ["closed"],
  closed: ["sent"],
};
