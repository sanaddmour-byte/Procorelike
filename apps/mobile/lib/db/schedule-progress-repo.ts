import * as Crypto from "expo-crypto";
import { getDb } from "./database";
import { enqueueOutbox } from "./outbox-repo";

export type ProgressUpdateSyncStatus = "pending" | "synced";
export type ProgressUpdateReviewStatus = "pending" | "accepted" | "rejected";

export interface LocalScheduleProgressUpdate {
  id: string;
  projectId: string;
  taskId: string;
  proposedPercentComplete: number | null;
  proposedActualStart: string | null;
  proposedActualFinish: string | null;
  note: string | null;
  reviewStatus: ProgressUpdateReviewStatus;
  rejectionReason: string | null;
  syncStatus: ProgressUpdateSyncStatus;
  createdAt: string;
}

interface Row {
  id: string;
  project_id: string;
  task_id: string;
  proposed_percent_complete: number | null;
  proposed_actual_start: string | null;
  proposed_actual_finish: string | null;
  note: string | null;
  review_status: string;
  rejection_reason: string | null;
  sync_status: string;
  created_at: string;
}

function fromRow(row: Row): LocalScheduleProgressUpdate {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    proposedPercentComplete: row.proposed_percent_complete,
    proposedActualStart: row.proposed_actual_start,
    proposedActualFinish: row.proposed_actual_finish,
    note: row.note,
    reviewStatus: row.review_status as ProgressUpdateReviewStatus,
    rejectionReason: row.rejection_reason,
    syncStatus: row.sync_status as ProgressUpdateSyncStatus,
    createdAt: row.created_at,
  };
}

export async function listLocalProgressUpdates(projectId: string): Promise<LocalScheduleProgressUpdate[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    "SELECT * FROM schedule_progress_updates WHERE project_id = ? ORDER BY created_at DESC",
    [projectId],
  );
  return rows.map(fromRow);
}

export async function getLocalProgressUpdate(id: string): Promise<LocalScheduleProgressUpdate | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>("SELECT * FROM schedule_progress_updates WHERE id = ?", [id]);
  return row ? fromRow(row) : null;
}

/**
 * Create-only, mirroring the API: a progress update is never edited
 * locally after submission, only accepted/rejected server-side by a
 * planner (a web-only action that reaches this device on the next pull,
 * see upsertProgressUpdateReviewFromServer). No photo attachment field --
 * that upload requires connectivity per the attachments flow, so it's out
 * of scope for the fully-offline submission path (docs/ROADMAP.md's
 * Phase 11c gate report documents this as a deliberate scope cut).
 */
export async function createLocalProgressUpdate(input: {
  projectId: string;
  taskId: string;
  proposedPercentComplete?: number;
  proposedActualStart?: string;
  proposedActualFinish?: string;
  note?: string;
}): Promise<LocalScheduleProgressUpdate> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO schedule_progress_updates
       (id, project_id, task_id, proposed_percent_complete, proposed_actual_start, proposed_actual_finish, note, review_status, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?)`,
    [
      id,
      input.projectId,
      input.taskId,
      input.proposedPercentComplete ?? null,
      input.proposedActualStart ?? null,
      input.proposedActualFinish ?? null,
      input.note ?? null,
      now,
    ],
  );
  await enqueueOutbox("schedule_progress_update", id, input.projectId);
  const row = await getLocalProgressUpdate(id);
  if (!row) throw new Error("Failed to create local progress update");
  return row;
}

/** Called once the outbox push for this record applies successfully. */
export async function markProgressUpdateSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE schedule_progress_updates SET sync_status = 'synced' WHERE id = ?", [id]);
}

/** Called on pull, to reflect a planner's accept/reject decision back onto the submitting device. Inserts the row if this is a different device than the one that submitted it. */
export async function upsertProgressUpdateFromServer(row: {
  id: string;
  projectId: string;
  taskId: string;
  proposedPercentComplete: number | null;
  proposedActualStart: string | null;
  proposedActualFinish: string | null;
  note: string | null;
  status: ProgressUpdateReviewStatus;
  rejectionReason: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO schedule_progress_updates
       (id, project_id, task_id, proposed_percent_complete, proposed_actual_start, proposed_actual_finish, note, review_status, rejection_reason, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
     ON CONFLICT(id) DO UPDATE SET review_status = excluded.review_status, rejection_reason = excluded.rejection_reason, sync_status = 'synced'`,
    [
      row.id,
      row.projectId,
      row.taskId,
      row.proposedPercentComplete,
      row.proposedActualStart,
      row.proposedActualFinish,
      row.note,
      row.status,
      row.rejectionReason,
      now,
    ],
  );
}
