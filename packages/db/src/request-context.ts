import { sql } from "drizzle-orm";
import type { Database, Tx } from "./client";

export interface RequestContext {
  userId: string;
  /** Project role for the request's target project, when applicable (used by the client_viewer financial-exclusion policy). Omit for operations with no single project in scope (e.g. writing a refresh token). */
  role?: string;
}

/**
 * Runs `fn` inside a transaction with `app.user_id`/`app.role` set via
 * set_config(..., true) (transaction-local, per docs/ARCHITECTURE.md §2),
 * so RLS policies keyed on current_setting('app.user_id'|'app.role', true)
 * see the authenticated caller's identity. Every mutating/reading API route
 * that touches tenant data must go through this rather than the raw `db`.
 */
export async function withRequestContext<T>(
  db: Database,
  ctx: RequestContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${ctx.userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', ${ctx.role ?? ""}, true)`);
    return fn(tx);
  });
}
