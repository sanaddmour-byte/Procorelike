import { createDbClient } from "@siteops/db";
import type { Env } from "./env";

/**
 * Two DB connections, deliberately:
 *
 * - `authDb` (superuser, RLS-bypassing): used ONLY for the narrow set of
 *   pre-authentication lookups that have no tenant/session context to scope
 *   by yet — finding a user by email at login, an invite by its token hash,
 *   a refresh token by its hash. Each of those has its own strong
 *   independent check (password verify, token expiry/single-use, hash
 *   match) standing in for RLS at that moment. See docs/ARCHITECTURE.md §3.
 * - `appDb` (siteops_app, RLS-enforced): used for everything else, once a
 *   caller is authenticated and `app.user_id`/`app.role` can be set via
 *   withRequestContext.
 */
export function createApiDbClients(env: Env) {
  const authDb = createDbClient(env.DATABASE_URL);
  const appDb = createDbClient(env.DATABASE_URL_APP);
  return { authDb, appDb };
}

export type ApiDbClients = ReturnType<typeof createApiDbClients>;
