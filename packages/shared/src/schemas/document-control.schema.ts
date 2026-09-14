import { z } from "zod";

export const transmittalPurposeSchema = z.enum([
  "for_review",
  "for_approval",
  "for_information",
  "as_requested",
  "for_construction",
  "for_bid",
]);
export type TransmittalPurpose = z.infer<typeof transmittalPurposeSchema>;

export const transmittalStatusSchema = z.enum(["draft", "sent"]);
export type TransmittalStatus = z.infer<typeof transmittalStatusSchema>;

export const transmittalItemTypeSchema = z.enum(["document", "drawing_revision", "drawing_set"]);
export type TransmittalItemType = z.infer<typeof transmittalItemTypeSchema>;

const transmittalItemInputSchema = z
  .object({
    itemType: transmittalItemTypeSchema,
    itemId: z.string().uuid(),
    description: z.string().min(1).max(300),
  })
  .strict();

const transmittalRecipientInputSchema = z
  .object({
    userId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.userId) || Boolean(data.companyId), {
    message: "Each recipient needs a userId or a companyId",
  });

export const createTransmittalSchema = z
  .object({
    projectId: z.string().uuid(),
    subject: z.string().min(1).max(300),
    purpose: transmittalPurposeSchema,
    message: z.string().max(5000).optional(),
    items: z.array(transmittalItemInputSchema).min(1),
    recipients: z.array(transmittalRecipientInputSchema).min(1),
  })
  .strict();
export type CreateTransmittalInput = z.infer<typeof createTransmittalSchema>;

export const createDrawingSetSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200),
    publishedDate: z.string().date(),
    drawingRevisionIds: z.array(z.string().uuid()).min(1),
  })
  .strict();
export type CreateDrawingSetInput = z.infer<typeof createDrawingSetSchema>;
