import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import type { ListNotificationsQuery, NotificationPayload, NotificationType } from "@siteops/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";
import { sendExpoPushMessages } from "../lib/push";

type NotificationRow = typeof schema.notifications.$inferSelect;

/**
 * Best-effort push fan-out to every device the recipient has registered
 * (push_tokens_select's RLS lets the *actor's* session read the
 * *recipient's* tokens -- see 001_rls_and_functions.sql). Never awaited by
 * its caller and never throws past this point: a down or slow push
 * provider must not affect the notification row it accompanies, exactly
 * like auth.service.ts's invite-email precedent.
 */
async function dispatchPush(tx: Tx, recipientUserId: string, payload: NotificationPayload): Promise<void> {
  const tokens = await tx.select({ token: schema.pushTokens.token }).from(schema.pushTokens).where(eq(schema.pushTokens.userId, recipientUserId));
  if (tokens.length === 0) return;
  const messages = tokens.map((t) => ({ to: t.token, title: "SiteOps", body: payload.summary, data: payload as Record<string, unknown> }));
  sendExpoPushMessages(messages).catch((err) => console.error("Failed to send push notification", err));
}

/**
 * Inserts a notification for one recipient. Callers run this from inside
 * their own withRequestContext transaction (the actor's), which is fine —
 * notifications_insert only checks "authenticated session", not that the
 * row's user_id matches the caller (see 001_rls_and_functions.sql). Never
 * notifies a user about their own action.
 */
export async function notifyUser(
  tx: Tx,
  recipientUserId: string,
  actorUserId: string,
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  if (recipientUserId === actorUserId) return;
  await tx.insert(schema.notifications).values({ userId: recipientUserId, type, payload });
  await dispatchPush(tx, recipientUserId, payload);
}

/** Convenience for the common "notify every id in this list, skipping the actor and duplicates" case. */
export async function notifyUsers(
  tx: Tx,
  recipientUserIds: readonly (string | null | undefined)[],
  actorUserId: string,
  type: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  const uniqueRecipients = new Set(recipientUserIds.filter((id): id is string => Boolean(id)));
  for (const recipientUserId of uniqueRecipients) {
    await notifyUser(tx, recipientUserId, actorUserId, type, payload);
  }
}

export async function listNotifications(
  appDb: Database,
  userId: string,
  query: ListNotificationsQuery,
): Promise<NotificationRow[]> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const conditions = [eq(schema.notifications.userId, userId)];
    if (query.unreadOnly) conditions.push(isNull(schema.notifications.readAt));
    return tx
      .select()
      .from(schema.notifications)
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(query.limit);
  });
}

export async function countUnreadNotifications(appDb: Database, userId: string): Promise<number> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const rows = await tx
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
    return rows.length;
  });
}

export async function markNotificationRead(appDb: Database, userId: string, notificationId: string): Promise<NotificationRow> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [updated] = await tx
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(eq(schema.notifications.id, notificationId))
      .returning();
    if (!updated) throw new NotFoundError("Notification not found");
    return updated;
  });
}

export async function markAllNotificationsRead(appDb: Database, userId: string): Promise<void> {
  await withRequestContext(appDb, { userId }, async (tx) => {
    await tx
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  });
}
