import * as Crypto from "expo-crypto";
import { getDb } from "./database";
import { enqueueOutbox } from "./outbox-repo";
import type { SyncStatus } from "./daily-log-repo";

export type LocalInspectionStatus = "in_progress" | "completed";

export interface LocalInspection {
  id: string;
  projectId: string;
  templateId: string;
  status: LocalInspectionStatus;
  signedByName: string | null;
  signedAt: string | null;
  baseRevision: number | null;
  syncStatus: SyncStatus;
  conflictData: unknown | null;
  updatedAt: string;
}

export interface LocalInspectionResponse {
  templateItemId: string;
  value: Record<string, unknown>;
}

interface InspectionRow {
  id: string;
  project_id: string;
  template_id: string;
  status: string;
  signed_by_name: string | null;
  signed_at: string | null;
  base_revision: number | null;
  sync_status: string;
  conflict_data: string | null;
  updated_at: string;
}

function fromRow(row: InspectionRow): LocalInspection {
  return {
    id: row.id,
    projectId: row.project_id,
    templateId: row.template_id,
    status: row.status as LocalInspectionStatus,
    signedByName: row.signed_by_name,
    signedAt: row.signed_at,
    baseRevision: row.base_revision,
    syncStatus: row.sync_status as SyncStatus,
    conflictData: row.conflict_data ? (JSON.parse(row.conflict_data) as unknown) : null,
    updatedAt: row.updated_at,
  };
}

/** Inspections are always started immediately (`in_progress`) on mobile — the "scheduled" state exists on the web app for planning ahead, but a field user opening this screen is starting the inspection right now (docs/ROADMAP.md Phase 5 gate report). */
export async function createInspection(input: { projectId: string; templateId: string }): Promise<LocalInspection> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    "INSERT INTO inspections (id, project_id, template_id, status, sync_status, updated_at) VALUES (?, ?, ?, 'in_progress', 'pending', ?)",
    [id, input.projectId, input.templateId, now],
  );
  await enqueueOutbox("inspection", id, input.projectId);
  const inspection = await getInspection(id);
  if (!inspection) throw new Error("Failed to create local inspection");
  return inspection;
}

export async function getInspection(id: string): Promise<LocalInspection | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<InspectionRow>("SELECT * FROM inspections WHERE id = ?", [id]);
  return row ? fromRow(row) : null;
}

export async function listInspections(projectId: string): Promise<LocalInspection[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<InspectionRow>(
    "SELECT * FROM inspections WHERE project_id = ? ORDER BY updated_at DESC",
    [projectId],
  );
  return rows.map(fromRow);
}

export async function getResponses(inspectionId: string): Promise<LocalInspectionResponse[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ template_item_id: string; value: string }>(
    "SELECT template_item_id, value FROM inspection_responses WHERE inspection_id = ?",
    [inspectionId],
  );
  return rows.map((r) => ({ templateItemId: r.template_item_id, value: JSON.parse(r.value) as Record<string, unknown> }));
}

export async function setResponse(inspectionId: string, templateItemId: string, value: Record<string, unknown>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO inspection_responses (inspection_id, template_item_id, value) VALUES (?, ?, ?)",
    [inspectionId, templateItemId, JSON.stringify(value)],
  );
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE inspections SET sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END, updated_at = ? WHERE id = ?",
    [now, inspectionId],
  );
  const inspection = await getInspection(inspectionId);
  if (inspection) await enqueueOutbox("inspection", inspectionId, inspection.projectId);
}

export async function completeInspection(id: string, signedByName: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    "UPDATE inspections SET status = 'completed', signed_by_name = ?, signed_at = ?, sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END, updated_at = ? WHERE id = ?",
    [signedByName, now, now, id],
  );
  const inspection = await getInspection(id);
  if (inspection) await enqueueOutbox("inspection", id, inspection.projectId);
}

/** Raw base snapshot (last-known-synced state, including its response set) — internal, used only by the sync engine's mergeFields call. */
export async function getInspectionBaseSnapshot(id: string): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ base_snapshot: string | null }>("SELECT base_snapshot FROM inspections WHERE id = ?", [id]);
  return row?.base_snapshot ? (JSON.parse(row.base_snapshot) as Record<string, unknown>) : null;
}

async function snapshotOf(id: string): Promise<{ status: string; signedByName: string | null; responses: LocalInspectionResponse[] } | null> {
  const inspection = await getInspection(id);
  if (!inspection) return null;
  return { status: inspection.status, signedByName: inspection.signedByName, responses: await getResponses(id) };
}

/** Called after a successful sync/pull or a conflict-free push — this becomes the new "last known good" baseline. */
export async function markInspectionSynced(
  id: string,
  serverRevision: number,
  fields: { status: LocalInspectionStatus; signedByName: string | null; signedAt: string | null },
): Promise<void> {
  const db = await getDb();
  const snapshot = await snapshotOf(id);
  await db.runAsync(
    "UPDATE inspections SET sync_status = 'synced', base_revision = ?, base_snapshot = ?, conflict_data = NULL, status = ?, signed_by_name = ?, signed_at = ? WHERE id = ?",
    [serverRevision, JSON.stringify(snapshot), fields.status, fields.signedByName, fields.signedAt, id],
  );
}

/** Called after a push comes back with a field-level conflict — keeps the record visible/editable, flagged for the resolution screen, never silently overwritten. */
export async function markInspectionConflict(
  id: string,
  serverRevision: number,
  conflicts: unknown,
  serverFields: { status: string; signedByName: string | null },
): Promise<void> {
  const db = await getDb();
  const responses = await getResponses(id);
  await db.runAsync(
    "UPDATE inspections SET sync_status = 'conflict', base_revision = ?, base_snapshot = ?, conflict_data = ? WHERE id = ?",
    [serverRevision, JSON.stringify({ ...serverFields, responses }), JSON.stringify(conflicts), id],
  );
}

/**
 * Applies a record pulled from the server. Skips records with unsynced
 * local edits ('pending') or an open conflict — a pull must never clobber
 * an offline edit that hasn't been pushed yet (see upsertDailyLogFromServer's
 * identical rule).
 */
export async function upsertInspectionFromServer(row: {
  id: string;
  projectId: string;
  templateId: string;
  status: LocalInspectionStatus;
  signedByName: string | null;
  signedAt: string | null;
  serverRevision: number;
  responses: LocalInspectionResponse[];
}): Promise<void> {
  const existing = await getInspection(row.id);
  if (existing && existing.syncStatus !== "synced") return;

  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO inspections (id, project_id, template_id, status, signed_by_name, signed_at, base_revision, base_snapshot, sync_status, conflict_data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', NULL, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status, signed_by_name = excluded.signed_by_name, signed_at = excluded.signed_at,
       base_revision = excluded.base_revision, base_snapshot = excluded.base_snapshot,
       sync_status = 'synced', conflict_data = NULL, updated_at = excluded.updated_at`,
    [
      row.id,
      row.projectId,
      row.templateId,
      row.status,
      row.signedByName,
      row.signedAt,
      row.serverRevision,
      JSON.stringify({ status: row.status, signedByName: row.signedByName, responses: row.responses }),
      now,
    ],
  );

  await db.runAsync("DELETE FROM inspection_responses WHERE inspection_id = ?", [row.id]);
  for (const response of row.responses) {
    await db.runAsync("INSERT INTO inspection_responses (inspection_id, template_item_id, value) VALUES (?, ?, ?)", [
      row.id,
      response.templateItemId,
      JSON.stringify(response.value),
    ]);
  }
}
