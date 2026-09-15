/**
 * A deliberately small, fixed set of real event types a webhook can
 * subscribe to — not a fake blanket event bus that promises coverage the
 * system doesn't actually wire up. Each one corresponds to exactly one
 * concrete dispatch call site in apps/api (see webhook.service.ts's
 * dispatchEvent callers); adding a new event type means adding a real
 * dispatch call, not just a string here.
 */
export const WEBHOOK_EVENT_TYPES = ["change_order.approved", "rfi.closed"] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}
