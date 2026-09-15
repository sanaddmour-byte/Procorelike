import { randomUUID } from "node:crypto";
import { schema, withRequestContext, type Database } from "@siteops/db";
import type { CreateWebhookSubscriptionInput, WebhookEventType } from "@siteops/shared";
import { generateWebhookSecret, signWebhookPayload } from "@siteops/shared/server";
import { and, eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";

type SubscriptionRow = typeof schema.webhookSubscriptions.$inferSelect;
export type SubscriptionListItem = Omit<SubscriptionRow, "secret">;

function stripSecret(row: SubscriptionRow): SubscriptionListItem {
  const { secret, ...rest } = row;
  void secret;
  return rest;
}

/** Same insert-time RLS rejection as api-key.service.ts's createApiKey -- see its comment. */
export async function createWebhookSubscription(
  appDb: Database,
  userId: string,
  input: CreateWebhookSubscriptionInput,
): Promise<SubscriptionListItem & { secret: string }> {
  const secret = generateWebhookSecret();
  return withRequestContext(appDb, { userId }, async (tx) => {
    const id = randomUUID();
    let row: SubscriptionRow | undefined;
    try {
      [row] = await tx
        .insert(schema.webhookSubscriptions)
        .values({ id, companyId: input.companyId, url: input.url, secret, eventTypes: input.eventTypes, createdBy: userId })
        .returning();
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "42501") {
        throw new ApiError(403, "not_company_member", "You are not a member of this company");
      }
      throw err;
    }
    if (!row) throw new NotFoundError("Company not found");
    return { ...stripSecret(row), secret };
  });
}

export async function listWebhookSubscriptions(appDb: Database, userId: string, companyId: string): Promise<SubscriptionListItem[]> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const rows = await tx.select().from(schema.webhookSubscriptions).where(eq(schema.webhookSubscriptions.companyId, companyId));
    return rows.map(stripSecret);
  });
}

export async function deleteWebhookSubscription(appDb: Database, userId: string, companyId: string, subscriptionId: string): Promise<void> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.webhookSubscriptions)
      .where(and(eq(schema.webhookSubscriptions.id, subscriptionId), eq(schema.webhookSubscriptions.companyId, companyId)))
      .limit(1);
    if (!existing) throw new NotFoundError("Webhook subscription not found");
    // Delivery log rows FK-reference this subscription -- delete them
    // first or the subscription delete violates the constraint.
    await tx.delete(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.subscriptionId, subscriptionId));
    await tx.delete(schema.webhookSubscriptions).where(eq(schema.webhookSubscriptions.id, subscriptionId));
  });
}

export async function listWebhookDeliveries(appDb: Database, userId: string, subscriptionId: string): Promise<(typeof schema.webhookDeliveries.$inferSelect)[]> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    return tx.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.subscriptionId, subscriptionId));
  });
}

/**
 * Fires a real event to every active subscription held by a company
 * participating in the given project (RFIs/change orders belong to a
 * project, not to any single company -- every company on the job, e.g.
 * the GC's own ERP-sync webhook, is a legitimate subscriber). Best-effort
 * only: one POST per subscription, no retry/backoff queue (explicit
 * scope-down -- docs decision, not an oversight), each attempt logged to
 * webhook_deliveries regardless of outcome. Called from a handful of
 * concrete dispatch sites (change-management.service.ts's
 * approveChangeOrder, rfi.service.ts's transitionRfiStatus) — never from a
 * generic hook, so the set of real event types stays exactly
 * WEBHOOK_EVENT_TYPES.
 *
 * Runs with `authDb` (RLS-bypassing): it fires from inside another
 * request's own withRequestContext transaction, scoped to that caller's
 * session, not any webhook owner's -- looking up a project's companies'
 * subscriptions must not depend on the acting user also being a member of
 * each of those companies (e.g. a subcontractor's RFI closure firing the
 * GC's webhook).
 */
export async function dispatchProjectEvent(
  authDb: Database,
  projectId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  const subscriptions = await authDb
    .select({ sub: schema.webhookSubscriptions })
    .from(schema.webhookSubscriptions)
    .innerJoin(schema.projectCompanies, eq(schema.projectCompanies.companyId, schema.webhookSubscriptions.companyId))
    .where(and(eq(schema.projectCompanies.projectId, projectId), eq(schema.webhookSubscriptions.active, true)));

  const targets = subscriptions.map((r) => r.sub).filter((s) => (s.eventTypes as string[]).includes(eventType));
  if (targets.length === 0) return;

  const body = JSON.stringify({ eventType, payload, deliveredAt: new Date().toISOString() });

  await Promise.all(
    targets.map(async (sub) => {
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const signature = signWebhookPayload(sub.secret, body);
        const res = await fetch(sub.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-SiteOps-Signature": signature, "X-SiteOps-Event": eventType },
          body,
          signal: AbortSignal.timeout(5000),
        });
        statusCode = res.status;
      } catch (err) {
        error = err instanceof Error ? err.message : "Unknown delivery error";
      }
      await authDb.insert(schema.webhookDeliveries).values({ subscriptionId: sub.id, eventType, statusCode, error });
    }),
  );
}
