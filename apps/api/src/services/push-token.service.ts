import { schema, withRequestContext, type Database } from "@siteops/db";
import type { RegisterPushTokenInput } from "@siteops/shared";
import { and, eq } from "drizzle-orm";

type PushTokenRow = typeof schema.pushTokens.$inferSelect;

/**
 * A device token belongs to whoever is logged in on it right now -- if it
 * was previously registered under a different account (a shared device,
 * or a re-login), re-registering reassigns it via upsert on the token's
 * own uniqueness rather than accumulating stale rows for the old owner.
 */
export async function registerPushToken(appDb: Database, userId: string, input: RegisterPushTokenInput): Promise<PushTokenRow> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [row] = await tx
      .insert(schema.pushTokens)
      .values({ userId, token: input.token, platform: input.platform })
      .onConflictDoUpdate({
        target: schema.pushTokens.token,
        set: { userId, platform: input.platform },
      })
      .returning();
    if (!row) throw new Error("Failed to register push token");
    return row;
  });
}

/** A no-op if the token was never registered, or already belongs to someone else -- either way there's nothing this caller needs to remove. */
export async function unregisterPushToken(appDb: Database, userId: string, token: string): Promise<void> {
  await withRequestContext(appDb, { userId }, async (tx) => {
    await tx.delete(schema.pushTokens).where(and(eq(schema.pushTokens.token, token), eq(schema.pushTokens.userId, userId)));
  });
}
