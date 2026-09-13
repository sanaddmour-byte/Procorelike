import { z } from "zod";

export const tmTicketStatusSchema = z.enum(["draft", "submitted", "approved", "rejected"]);
export type TmTicketStatus = z.infer<typeof tmTicketStatusSchema>;

const tmTicketLaborEntrySchema = z
  .object({
    workerName: z.string().min(1).max(200),
    trade: z.string().max(100).optional(),
    hours: z.number().positive(),
    rate: z.number().nonnegative(),
  })
  .strict();

const tmTicketEquipmentEntrySchema = z
  .object({
    description: z.string().min(1).max(300),
    hours: z.number().positive(),
    rate: z.number().nonnegative(),
  })
  .strict();

const tmTicketMaterialEntrySchema = z
  .object({
    description: z.string().min(1).max(300),
    quantity: z.number().positive(),
    unit: z.string().min(1).max(50),
    unitCost: z.number().nonnegative(),
  })
  .strict();

export const createTmTicketSchema = z
  .object({
    projectId: z.string().uuid(),
    companyId: z.string().uuid(),
    workDate: z.string().date(),
    description: z.string().min(1).max(4000),
    laborEntries: z.array(tmTicketLaborEntrySchema).max(100).default([]),
    equipmentEntries: z.array(tmTicketEquipmentEntrySchema).max(100).default([]),
    materialEntries: z.array(tmTicketMaterialEntrySchema).max(100).default([]),
  })
  .strict();
export type CreateTmTicketInput = z.infer<typeof createTmTicketSchema>;

export const transitionTmTicketStatusSchema = z
  .object({
    toStatus: tmTicketStatusSchema,
    /** Required when transitioning to "rejected" -- enforced in the service, same pattern as a safety incident's corrective action. */
    rejectionReason: z.string().max(2000).optional(),
  })
  .strict();
export type TransitionTmTicketStatusInput = z.infer<typeof transitionTmTicketStatusSchema>;

/** A rejected ticket can go back to draft for resubmission -- not a dead end. Approved is terminal (matches a submittal's "approved" being final in this codebase). */
export const TM_TICKET_STATUS_TRANSITIONS: Record<TmTicketStatus, readonly TmTicketStatus[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
  rejected: ["draft"],
  approved: [],
};
