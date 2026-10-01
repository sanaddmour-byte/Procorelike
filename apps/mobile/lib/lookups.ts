import { apiJson } from "./api-client";
import { getDb } from "./db/database";

/**
 * Network-first JSON with a SQLite fallback, so pickers (assignee, location) still work with no connection after the
 * first online visit. Stored in sync_meta under `lookup:<path>`.
 */
export async function cachedLookup<T>(path: string): Promise<T | null> {
  const db = await getDb();
  const key = `lookup:${path}`;
  try {
    const fresh = await apiJson<T>(path);
    await db.runAsync("INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, JSON.stringify(fresh)]);
    return fresh;
  } catch {
    const row = await db.getFirstAsync<{ value: string | null }>("SELECT value FROM sync_meta WHERE key = ?", [key]);
    return row?.value ? (JSON.parse(row.value) as T) : null;
  }
}

export interface MemberOption {
  userId: string;
  name: string;
}

export interface LocationOption {
  id: string;
  name: string;
  path: string;
}
