import { z } from "zod";

// ~10MB decoded, expressed as a base64 character-length cap (base64 runs ~4/3 the size of its decoded bytes).
const MAX_ATTACHMENT_BASE64_LENGTH = 14_000_000;

const inboundEmailAttachmentSchema = z
  .object({
    filename: z.string().min(1).max(300),
    contentType: z.string().min(1).max(200),
    contentBase64: z.string().min(1).max(MAX_ATTACHMENT_BASE64_LENGTH),
  })
  .strict();

/**
 * The generic contract this app's inbound-email webhook accepts --
 * provider-agnostic on purpose. Whichever inbound-email provider is wired
 * up in a given deployment (SendGrid Inbound Parse, Mailgun Routes, SES
 * receipt rules) posts in its own native shape; translating that into this
 * shape is a deployment-time webhook-config concern (docs/ARCHITECTURE.md),
 * not application code, since it varies per provider and this app has no
 * production inbound-email account configured yet.
 */
export const inboundEmailWebhookSchema = z
  .object({
    to: z.string().min(1),
    from: z.string().min(1),
    subject: z.string().max(300).default(""),
    text: z.string().max(50_000).default(""),
    attachments: z.array(inboundEmailAttachmentSchema).max(5).default([]),
  })
  .strict();
export type InboundEmailWebhookInput = z.infer<typeof inboundEmailWebhookSchema>;
