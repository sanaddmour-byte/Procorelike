import { randomUUID } from "node:crypto";
import { schema, withRequestContext, type Database } from "@siteops/db";
import type { CreateApiKeyInput } from "@siteops/shared";
import { generateApiKey, hashApiKey } from "@siteops/shared/server";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";

type ApiKeyRow = typeof schema.apiKeys.$inferSelect;
export type ApiKeyListItem = Omit<ApiKeyRow, "keyHash">;

function stripHash(row: ApiKeyRow): ApiKeyListItem {
  const { keyHash, ...rest } = row;
  void keyHash;
  return rest;
}

/** The plaintext key is returned ONLY here, at creation -- every other read (list, this response's own persisted row) sees keyPrefix alone. RLS's api_keys_company_member policy (is_company_member) is what actually gates who may call this; there's no separate permission-module check since this is company-level admin, not project-level. */
export async function createApiKey(
  appDb: Database,
  userId: string,
  input: CreateApiKeyInput,
): Promise<ApiKeyListItem & { plaintext: string }> {
  const { plaintext, prefix } = generateApiKey();
  const keyHash = hashApiKey(plaintext);
  return withRequestContext(appDb, { userId }, async (tx) => {
    const id = randomUUID();
    let row: ApiKeyRow | undefined;
    try {
      [row] = await tx
        .insert(schema.apiKeys)
        .values({ id, companyId: input.companyId, name: input.name, keyHash, keyPrefix: prefix, createdBy: userId })
        .returning();
    } catch (err) {
      // The WITH CHECK is_company_member(company_id) clause rejects the
      // insert itself (Postgres 42501) rather than silently returning 0
      // rows, since unlike an UPDATE there's no pre-existing row for the
      // policy to hide -- translate it to the same 403 shape as the
      // company-logo upload's "not a member" case.
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "42501") {
        throw new ApiError(403, "not_company_member", "You are not a member of this company");
      }
      throw err;
    }
    if (!row) throw new NotFoundError("Company not found");
    return { ...stripHash(row), plaintext };
  });
}

export async function listApiKeys(appDb: Database, userId: string, companyId: string): Promise<ApiKeyListItem[]> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const rows = await tx.select().from(schema.apiKeys).where(eq(schema.apiKeys.companyId, companyId));
    return rows.map(stripHash);
  });
}

export async function revokeApiKey(appDb: Database, userId: string, companyId: string, keyId: string): Promise<ApiKeyListItem> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.companyId, companyId)))
      .limit(1);
    if (!existing) throw new NotFoundError("API key not found");
    if (existing.revokedAt) return stripHash(existing);

    const [updated] = await tx
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.apiKeys.id, keyId))
      .returning();
    if (!updated) throw new Error("Failed to revoke API key");
    return stripHash(updated);
  });
}

export interface ResolvedApiKey {
  userId: string;
  email: string;
  companyId: string;
}

/**
 * Called from apps/api's requireApiKey middleware, before any session
 * context exists -- like login(), this runs against the RLS-bypassing
 * authDb, with the sha256 lookup itself (plus the revoked_at/prefix
 * checks) standing in for RLS at this moment. Touches lastUsedAt
 * best-effort in the same call so a revoked-but-recently-used key is
 * still visible to whoever's auditing it.
 */
export async function verifyApiKeyAndTouch(authDb: Database, plaintext: string): Promise<ResolvedApiKey | null> {
  const keyHash = hashApiKey(plaintext);
  const [row] = await authDb
    .select({ apiKey: schema.apiKeys, email: schema.users.email })
    .from(schema.apiKeys)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiKeys.createdBy))
    .where(and(eq(schema.apiKeys.keyHash, keyHash), isNull(schema.apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;

  await authDb.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.apiKey.id));
  return { userId: row.apiKey.createdBy, email: row.email, companyId: row.apiKey.companyId };
}
