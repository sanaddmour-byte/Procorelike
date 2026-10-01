import * as Crypto from "expo-crypto";
import type { PunchItemStatus } from "@siteops/shared";
import { getDb } from "./database";
import { enqueueOutbox } from "./outbox-repo";
import type { SyncStatus } from "./daily-log-repo";

export interface LocalPunchItem {
  id: string;
  projectId: string;
  number: string | null;
  description: string;
  priority: "low" | "medium" | "high";
  status: PunchItemStatus;
  dueDate: string | null;
  assigneeUserId: string | null;
  locationId: string | null;
  baseRevision: number | null;
  syncStatus: SyncStatus;
  conflictData: unknown | null;
  updatedAt: string;
}

interface PunchItemRow {
  id: string;
  project_id: string;
  number: string | null;
  description: string;
  priority: string;
  status: string;
  due_date: string | null;
  assignee_user_id: string | null;
  location_id: string | null;
  base_revision: number | null;
  sync_status: string;
  conflict_data: string | null;
  updated_at: string;
}

function fromRow(row: PunchItemRow): LocalPunchItem {
  return {
    id: row.id,
    projectId: row.project_id,
    number: row.number,
    description: row.description,
    priority: row.priority as LocalPunchItem["priority"],
    status: row.status as LocalPunchItem["status"],
    dueDate: row.due_date,
    assigneeUserId: row.assignee_user_id,
    locationId: row.location_id,
    baseRevision: row.base_revision,
    syncStatus: row.sync_status as SyncStatus,
    conflictData: row.conflict_data ? (JSON.parse(row.conflict_data) as unknown) : null,
    updatedAt: row.updated_at,
  };
}

export async function listPunchItems(projectId: string): Promise<LocalPunchItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PunchItemRow>(
    "SELECT * FROM punch_items WHERE project_id = ? ORDER BY updated_at DESC",
    [projectId],
  );
  return rows.map(fromRow);
}

export async function getPunchItem(id: string): Promise<LocalPunchItem | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<PunchItemRow>("SELECT * FROM punch_items WHERE id = ?", [id]);
  return row ? fromRow(row) : null;
}

export async function getPunchItemBaseSnapshot(id: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ base_snapshot: string | null }>(
    "SELECT base_snapshot FROM punch_items WHERE id = ?",
    [id],
  );
  return row?.base_snapshot ? (JSON.parse(row.base_snapshot) as Record<string, unknown>) : null;
}

export async function createPunchItem(input: {
  projectId: string;
  description: string;
  priority?: "low" | "medium" | "high";
  assigneeUserId?: string | null;
  locationId?: string | null;
  photos?: { uri: string; filename: string; mime: string }[];
}): Promise<LocalPunchItem> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT INTO punch_items (id, project_id, description, priority, assignee_user_id, location_id, status, sync_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', 'pending', ?)",
    [id, input.projectId, input.description, input.priority ?? "medium", input.assigneeUserId ?? null, input.locationId ?? null, now],
  );
  for (const photo of input.photos ?? []) {
    await db.runAsync(
      "INSERT INTO punch_item_photos (id, punch_item_id, project_id, uri, filename, mime, uploaded, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
      [Crypto.randomUUID(), id, input.projectId, photo.uri, photo.filename, photo.mime, now],
    );
  }
  await enqueueOutbox("punch_item", id, input.projectId);
  const item = await getPunchItem(id);
  if (!item) throw new Error("Failed to create local punch item");
  return item;
}

export async function updatePunchItemDescription(id: string, description: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE punch_items SET description = ?, sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END, updated_at = ? WHERE id = ?",
    [description, now, id],
  );
  const item = await getPunchItem(id);
  if (item) await enqueueOutbox("punch_item", id, item.projectId);
}

export async function markPunchItemSynced(
  id: string,
  serverRevision: number,
  fields: { number: string | null; description: string; status: LocalPunchItem["status"] },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE punch_items SET sync_status = 'synced', base_revision = ?, base_snapshot = ?, conflict_data = NULL, number = ?, description = ?, status = ? WHERE id = ?",
    [
      serverRevision,
      JSON.stringify({ description: fields.description }),
      fields.number,
      fields.description,
      fields.status,
      id,
    ],
  );
}

export async function markPunchItemConflict(
  id: string,
  serverRevision: number,
  conflicts: unknown,
  serverDescription: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE punch_items SET sync_status = 'conflict', base_revision = ?, base_snapshot = ?, conflict_data = ? WHERE id = ?",
    [serverRevision, JSON.stringify({ description: serverDescription }), JSON.stringify(conflicts), id],
  );
}

/**
 * Status transitions go straight to the API (they carry workflow validation
 * that isn't part of the offline field-merge protocol — see
 * docs/ARCHITECTURE.md §6) rather than through the outbox. This just
 * reflects a successful transition's result back into the local cache so
 * the list/detail screens don't show stale status until the next pull.
 */
export async function applyPunchItemTransitionLocally(
  id: string,
  status: LocalPunchItem["status"],
  serverRevision: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE punch_items SET status = ?, base_revision = ?, sync_status = 'synced' WHERE id = ?",
    [status, serverRevision, id],
  );
}

/** See upsertDailyLogFromServer's doc comment — same "never clobber a pending local edit" rule applies here. */
export async function upsertPunchItemFromServer(row: {
  id: string;
  projectId: string;
  number: string | null;
  description: string;
  priority: LocalPunchItem["priority"];
  status: LocalPunchItem["status"];
  dueDate: string | null;
  serverRevision: number;
}): Promise<void> {
  const existing = await getPunchItem(row.id);
  if (existing && existing.syncStatus !== "synced") return;

  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO punch_items (id, project_id, number, description, priority, status, due_date, base_revision, base_snapshot, sync_status, conflict_data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       number = excluded.number, description = excluded.description, priority = excluded.priority,
       status = excluded.status, due_date = excluded.due_date, base_revision = excluded.base_revision,
       base_snapshot = excluded.base_snapshot, sync_status = 'synced', conflict_data = NULL, updated_at = excluded.updated_at`,
    [
      row.id,
      row.projectId,
      row.number,
      row.description,
      row.priority,
      row.status,
      row.dueDate,
      row.serverRevision,
      JSON.stringify({ description: row.description }),
      now,
    ],
  );
}

export interface PendingPunchPhoto {
  id: string;
  punchItemId: string;
  projectId: string;
  uri: string;
  filename: string;
  mime: string;
}

/** Photos captured offline whose punch item has reached the server, so they can be uploaded now. */
export async function listUploadablePunchPhotos(projectId: string): Promise<PendingPunchPhoto[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; punch_item_id: string; project_id: string; uri: string; filename: string; mime: string }>(
    `SELECT p.* FROM punch_item_photos p JOIN punch_items i ON i.id = p.punch_item_id
     WHERE p.project_id = ? AND p.uploaded = 0 AND i.sync_status = 'synced'`,
    [projectId],
  );
  return rows.map((r) => ({ id: r.id, punchItemId: r.punch_item_id, projectId: r.project_id, uri: r.uri, filename: r.filename, mime: r.mime }));
}

export async function markPunchPhotoUploaded(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE punch_item_photos SET uploaded = 1 WHERE id = ?", [id]);
}

export async function countPendingPunchPhotos(projectId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM punch_item_photos WHERE project_id = ? AND uploaded = 0", [projectId]);
  return row?.n ?? 0;
}
