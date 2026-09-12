import { getDb } from "./database";

export type SyncEntityType = "daily_log" | "punch_item";

export interface OutboxEntry {
  queueId: string;
  entityType: SyncEntityType;
  localId: string;
  projectId: string;
  createdAt: string;
}

/** One outbox row per (entityType, localId) — repeated local edits before a sync just keep the same queue entry, since the sync engine always reads the entity's *current* state, not a snapshot captured at enqueue time. */
export async function enqueueOutbox(entityType: SyncEntityType, localId: string, projectId: string): Promise<void> {
  const db = await getDb();
  const queueId = `${entityType}:${localId}`;
  await db.runAsync(
    "INSERT OR IGNORE INTO outbox (queue_id, entity_type, local_id, project_id, created_at) VALUES (?, ?, ?, ?, ?)",
    [queueId, entityType, localId, projectId, new Date().toISOString()],
  );
}

export async function dequeueOutbox(queueId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM outbox WHERE queue_id = ?", [queueId]);
}

export async function listOutbox(projectId?: string): Promise<OutboxEntry[]> {
  const db = await getDb();
  interface Row {
    queue_id: string;
    entity_type: string;
    local_id: string;
    project_id: string;
    created_at: string;
  }
  const rows = projectId
    ? await db.getAllAsync<Row>("SELECT * FROM outbox WHERE project_id = ? ORDER BY created_at ASC", [projectId])
    : await db.getAllAsync<Row>("SELECT * FROM outbox ORDER BY created_at ASC");
  return rows.map((r) => ({
    queueId: r.queue_id,
    entityType: r.entity_type as SyncEntityType,
    localId: r.local_id,
    projectId: r.project_id,
    createdAt: r.created_at,
  }));
}

export async function outboxCount(projectId?: string): Promise<number> {
  const entries = await listOutbox(projectId);
  return entries.length;
}

export async function getLastSyncedAt(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>("SELECT value FROM sync_meta WHERE key = 'last_synced_at'");
  return row?.value ?? null;
}

export async function setLastSyncedAt(iso: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT INTO sync_meta (key, value) VALUES ('last_synced_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    iso,
  ]);
}

export async function getSyncCursor(entityType: SyncEntityType, projectId: string): Promise<number> {
  const db = await getDb();
  const key = `cursor:${entityType}:${projectId}`;
  const row = await db.getFirstAsync<{ value: string | null }>("SELECT value FROM sync_meta WHERE key = ?", [key]);
  return row?.value ? Number(row.value) : 0;
}

export async function setSyncCursor(entityType: SyncEntityType, projectId: string, cursor: number): Promise<void> {
  const db = await getDb();
  const key = `cursor:${entityType}:${projectId}`;
  await db.runAsync("INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    key,
    String(cursor),
  ]);
}
