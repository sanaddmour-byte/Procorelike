import { z } from "zod";

export const rfiStatusSchema = z.enum(["draft", "open", "answered", "closed"]);
export type RfiStatus = z.infer<typeof rfiStatusSchema>;

export const createRfiSchema = z
  .object({
    projectId: z.string().uuid(),
    subject: z.string().min(1).max(300),
    question: z.string().min(1),
    ballInCourtUserId: z.string().uuid().optional(),
    ballInCourtCompanyId: z.string().uuid().optional(),
    dueDate: z.string().date().optional(),
    costImpactFlag: z.boolean().default(false),
    scheduleImpactFlag: z.boolean().default(false),
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

/** Valid forward transitions — enforced server-side. Marking an official response auto-transitions draft/open → answered (see rfi.service.ts); this table also allows that same edge for an explicit PATCH. */
export const RFI_STATUS_TRANSITIONS: Record<RfiStatus, readonly RfiStatus[]> = {
  draft: ["open"],
  open: ["answered", "closed"],
  answered: ["closed", "open"],
  closed: [],
};
