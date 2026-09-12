import * as Crypto from "expo-crypto";
import { getDb } from "./database";
import { enqueueOutbox } from "./outbox-repo";

export type SyncStatus = "pending" | "synced" | "conflict";

export interface LocalDailyLog {
  id: string;
  projectId: string;
  logDate: string;
  notes: string | null;
  lockedAt: string | null;
  baseRevision: number | null;
  syncStatus: SyncStatus;
  conflictData: unknown | null;
  updatedAt: string;
}

interface DailyLogRow {
  id: string;
  project_id: string;
  log_date: string;
  notes: string | null;
  locked_at: string | null;
  base_revision: number | null;
  sync_status: string;
  conflict_data: string | null;
  updated_at: string;
}

function fromRow(row: DailyLogRow): LocalDailyLog {
  return {
    id: row.id,
    projectId: row.project_id,
    logDate: row.log_date,
    notes: row.notes,
    lockedAt: row.locked_at,
    baseRevision: row.base_revision,
    syncStatus: row.sync_status as SyncStatus,
    conflictData: row.conflict_data ? (JSON.parse(row.conflict_data) as unknown) : null,
    updatedAt: row.updated_at,
  };
}

export async function listDailyLogs(projectId: string): Promise<LocalDailyLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DailyLogRow>(
    "SELECT * FROM daily_logs WHERE project_id = ? ORDER BY log_date DESC",
    [projectId],
  );
  return rows.map(fromRow);
}

export async function getDailyLog(id: string): Promise<LocalDailyLog | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<DailyLogRow>("SELECT * FROM daily_logs WHERE id = ?", [id]);
  return row ? fromRow(row) : null;
}

/** Raw base snapshot (last-known-synced field values) — internal, used only by the sync engine's mergeFields call. */
export async function getDailyLogBaseSnapshot(id: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ base_snapshot: string | null }>(
    "SELECT base_snapshot FROM daily_logs WHERE id = ?",
    [id],
  );
  return row?.base_snapshot ? (JSON.parse(row.base_snapshot) as Record<string, unknown>) : null;
}

export async function createDailyLog(input: {
  projectId: string;
  logDate: string;
  notes?: string;
}): Promise<LocalDailyLog> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT INTO daily_logs (id, project_id, log_date, notes, sync_status, updated_at) VALUES (?, ?, ?, ?, 'pending', ?)",
    [id, input.projectId, input.logDate, input.notes ?? null, now],
  );
  await enqueueOutbox("daily_log", id, input.projectId);
  const log = await getDailyLog(id);
  if (!log) throw new Error("Failed to create local daily log");
  return log;
}

export async function updateDailyLogNotes(id: string, notes: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE daily_logs SET notes = ?, sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END, updated_at = ? WHERE id = ?",
    [notes, now, id],
  );
  const log = await getDailyLog(id);
  if (log) await enqueueOutbox("daily_log", id, log.projectId);
}

/** Called after a successful sync/pull or a conflict-free push — this becomes the new "last known good" baseline. */
export async function markDailyLogSynced(
  id: string,
  serverRevision: number,
  fields: { notes: string | null; lockedAt: string | null },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE daily_logs SET sync_status = 'synced', base_revision = ?, base_snapshot = ?, conflict_data = NULL, notes = ?, locked_at = ? WHERE id = ?",
    [serverRevision, JSON.stringify({ notes: fields.notes }), fields.notes, fields.lockedAt, id],
  );
}

/** Called after a push comes back with a field-level conflict — keeps the record visible/editable, flagged for the resolution screen, never silently overwritten. */
export async function markDailyLogConflict(
  id: string,
  serverRevision: number,
  conflicts: unknown,
  serverNotes: string | null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE daily_logs SET sync_status = 'conflict', base_revision = ?, base_snapshot = ?, conflict_data = ? WHERE id = ?",
    [serverRevision, JSON.stringify({ notes: serverNotes }), JSON.stringify(conflicts), id],
  );
}

/**
 * Applies a record pulled from the server. Skips records with unsynced
 * local edits ('pending') — a pull must never clobber an offline edit
 * that hasn't been pushed yet; that reconciliation happens on push, not
 * pull. A 'conflict' row also isn't touched here (the resolution screen
 * owns clearing that state via an explicit PATCH).
 */
export async function upsertDailyLogFromServer(row: {
  id: string;
  projectId: string;
  logDate: string;
  notes: string | null;
  lockedAt: string | null;
  serverRevision: number;
}): Promise<void> {
  const existing = await getDailyLog(row.id);
  if (existing && existing.syncStatus !== "synced") return;

  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO daily_logs (id, project_id, log_date, notes, locked_at, base_revision, base_snapshot, sync_status, conflict_data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       notes = excluded.notes, locked_at = excluded.locked_at, base_revision = excluded.base_revision,
       base_snapshot = excluded.base_snapshot, sync_status = 'synced', conflict_data = NULL, updated_at = excluded.updated_at`,
    [
      row.id,
      row.projectId,
      row.logDate,
      row.notes,
      row.lockedAt,
      row.serverRevision,
      JSON.stringify({ notes: row.notes }),
      now,
    ],
  );
}
