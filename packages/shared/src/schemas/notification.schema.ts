import { z } from "zod";

/**
 * `type` names the event that produced the notification, one per site
 * where notifyUsers() is called from a service (see notification.service.ts
 * on the API side). Kept as a plain string union here rather than pulled
 * from MODULES since a module can raise several distinct notification
 * types (e.g. rfis raises both rfi_assigned and rfi_answered).
 */
export const NOTIFICATION_TYPES = [
  "rfi_assigned",
  "rfi_answered",
  "rfi_overdue",
  "submittal_assigned",
  "submittal_status_changed",
  "punch_item_assigned",
  "punch_item_status_changed",
  "change_order_status_changed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * payload shape varies by type but always carries enough to deep-link and
 * summarize without a second fetch: the entity, its project, and a short
 * human-readable label. Validated loosely here since the API constructs
 * these server-side rather than accepting them from client input.
 */
export const notificationPayloadSchema = z
  .object({
    projectId: z.string().uuid(),
    entityType: z.string().min(1),
    entityId: z.string().uuid(),
    summary: z.string().min(1).max(500),
  })
  .passthrough();
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export const listNotificationsQuerySchema = z
  .object({
    unreadOnly: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
