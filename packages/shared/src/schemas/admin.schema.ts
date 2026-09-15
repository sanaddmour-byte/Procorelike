import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "../constants/webhook-events";

export const createApiKeySchema = z
  .object({
    companyId: z.string().uuid(),
    name: z.string().min(1).max(200),
  })
  .strict();
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const createWebhookSubscriptionSchema = z
  .object({
    companyId: z.string().uuid(),
    url: z.string().url().max(2000),
    eventTypes: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
  })
  .strict();
export type CreateWebhookSubscriptionInput = z.infer<typeof createWebhookSubscriptionSchema>;

export const updateWebhookSubscriptionSchema = z
  .object({
    active: z.boolean(),
  })
  .strict();
export type UpdateWebhookSubscriptionInput = z.infer<typeof updateWebhookSubscriptionSchema>;
