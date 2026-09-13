import type { FieldConflict } from "@siteops/shared";
import { apiJson } from "../api-client";
import {
  getDailyLog,
  getDailyLogBaseSnapshot,
  markDailyLogConflict,
  markDailyLogSynced,
  upsertDailyLogFromServer,
} from "../db/daily-log-repo";
import {
  getInspection,
  getInspectionBaseSnapshot,
  getResponses,
  markInspectionConflict,
  markInspectionSynced,
  upsertInspectionFromServer,
  type LocalInspectionResponse,
} from "../db/inspection-repo";
import { dequeueOutbox, getSyncCursor, listOutbox, setLastSyncedAt, setSyncCursor, type OutboxEntry, type SyncEntityType } from "../db/outbox-repo";
import {
  getPunchItem,
  getPunchItemBaseSnapshot,
  markPunchItemConflict,
  markPunchItemSynced,
  upsertPunchItemFromServer,
} from "../db/punch-item-repo";
import {
  getLocalProgressUpdate,
  markProgressUpdateSynced,
  upsertProgressUpdateFromServer,
  type ProgressUpdateReviewStatus,
} from "../db/schedule-progress-repo";

interface SyncPushRecordResult {
  localId: string;
  status: "applied" | "conflict" | "rejected";
  serverRevision?: number;
  conflicts?: FieldConflict[];
  reason?: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  rejected: number;
  ranOffline: boolean;
}

const ENTITY_TYPES: SyncEntityType[] = ["daily_log", "punch_item", "inspection", "schedule_progress_update"];

/**
 * Drains the outbox (push), then pulls anything changed server-side since
 * the last cursor, for every offline-capable entity type. Called on a
 * manual "Sync now" tap and opportunistically (app foreground / after a
 * successful mutation) — see docs/ARCHITECTURE.md §6. Any network failure
 * degrades to `ranOffline: true` rather than throwing: everything that
 * wasn't pushed/pulled simply stays queued for the next attempt.
 */
export async function syncProject(projectId: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, rejected: 0, ranOffline: false };

  try {
    for (const entityType of ENTITY_TYPES) await pushOutbox(projectId, entityType, result);
    for (const entityType of ENTITY_TYPES) await pullEntity(projectId, entityType, result);
    await setLastSyncedAt(new Date().toISOString());
  } catch {
    result.ranOffline = true;
  }

  return result;
}

async function buildPushData(entityType: SyncEntityType, localId: string): Promise<{ baseRevision: number | null; base: unknown; data: Record<string, unknown> }> {
  if (entityType === "daily_log") {
    const log = await getDailyLog(localId);
    const base = await getDailyLogBaseSnapshot(localId);
    return { baseRevision: log?.baseRevision ?? null, base, data: { logDate: log?.logDate, notes: log?.notes ?? null } };
  }
  if (entityType === "punch_item") {
    const item = await getPunchItem(localId);
    const base = await getPunchItemBaseSnapshot(localId);
    return { baseRevision: item?.baseRevision ?? null, base, data: { description: item?.description ?? "" } };
  }
  if (entityType === "schedule_progress_update") {
    const update = await getLocalProgressUpdate(localId);
    return {
      baseRevision: null, // create-only: never has a base to diff against
      base: null,
      data: {
        taskId: update?.taskId,
        proposedPercentComplete: update?.proposedPercentComplete ?? undefined,
        proposedActualStart: update?.proposedActualStart ?? undefined,
        proposedActualFinish: update?.proposedActualFinish ?? undefined,
        note: update?.note ?? undefined,
      },
    };
  }
  const inspection = await getInspection(localId);
  const base = await getInspectionBaseSnapshot(localId);
  const responses = await getResponses(localId);
  return {
    baseRevision: inspection?.baseRevision ?? null,
    base,
    data: {
      templateId: inspection?.templateId,
      status: inspection?.status ?? "in_progress",
      signedByName: inspection?.signedByName ?? null,
      responses: responses.map((r) => ({ templateItemId: r.templateItemId, value: r.value })),
    },
  };
}

async function markApplied(entityType: SyncEntityType, localId: string, serverRevision: number): Promise<void> {
  if (entityType === "daily_log") {
    const log = await getDailyLog(localId);
    await markDailyLogSynced(localId, serverRevision, { notes: log?.notes ?? null, lockedAt: log?.lockedAt ?? null });
  } else if (entityType === "punch_item") {
    const item = await getPunchItem(localId);
    await markPunchItemSynced(localId, serverRevision, {
      number: item?.number ?? null,
      description: item?.description ?? "",
      status: item?.status ?? "open",
    });
  } else if (entityType === "schedule_progress_update") {
    await markProgressUpdateSynced(localId);
  } else {
    const inspection = await getInspection(localId);
    await markInspectionSynced(localId, serverRevision, {
      status: inspection?.status ?? "in_progress",
      signedByName: inspection?.signedByName ?? null,
      signedAt: inspection?.signedAt ?? null,
    });
  }
}

async function markConflicted(entityType: SyncEntityType, localId: string, serverRevision: number, conflicts: FieldConflict[]): Promise<void> {
  if (entityType === "daily_log") {
    const server = await apiJson<{ notes: string | null }>(`/daily-logs/${localId}`);
    await markDailyLogConflict(localId, serverRevision, conflicts, server.notes);
  } else if (entityType === "punch_item") {
    const server = await apiJson<{ description: string }>(`/punch-items/${localId}`);
    await markPunchItemConflict(localId, serverRevision, conflicts, server.description);
  } else if (entityType === "schedule_progress_update") {
    // Unreachable: applyScheduleProgressUpdatePush (create-only) only ever returns "applied" or "rejected", never "conflict".
    throw new Error("schedule_progress_update push never produces a conflict result");
  } else {
    const server = await apiJson<{ status: string; signedByName: string | null }>(`/inspections/${localId}`);
    await markInspectionConflict(localId, serverRevision, conflicts, { status: server.status, signedByName: server.signedByName });
  }
}

async function pushOutbox(projectId: string, entityType: SyncEntityType, result: SyncResult): Promise<void> {
  const allEntries = await listOutbox(projectId);
  const entries: OutboxEntry[] = allEntries.filter((e) => e.entityType === entityType);
  if (entries.length === 0) return;

  const records = await Promise.all(
    entries.map(async (entry) => ({ localId: entry.localId, ...(await buildPushData(entityType, entry.localId)) })),
  );

  const response = await apiJson<{ results: SyncPushRecordResult[] }>("/sync/push", {
    method: "POST",
    body: JSON.stringify({ projectId, entityType, records }),
  });

  for (const r of response.results) {
    await dequeueOutbox(`${entityType}:${r.localId}`);

    if (r.status === "applied" && r.serverRevision !== undefined) {
      result.pushed += 1;
      await markApplied(entityType, r.localId, r.serverRevision);
    } else if (r.status === "conflict" && r.serverRevision !== undefined) {
      result.conflicts += 1;
      await markConflicted(entityType, r.localId, r.serverRevision, r.conflicts ?? []);
    } else {
      result.rejected += 1;
    }
  }
}

async function pullEntity(projectId: string, entityType: SyncEntityType, result: SyncResult): Promise<void> {
  const since = await getSyncCursor(entityType, projectId);
  const response = await apiJson<{ records: Record<string, unknown>[]; cursor: number }>(
    `/sync/pull?projectId=${projectId}&entityType=${entityType}&since=${since}`,
  );

  for (const record of response.records) {
    result.pulled += 1;
    if (entityType === "daily_log") {
      await upsertDailyLogFromServer({
        id: record.id as string,
        projectId,
        logDate: String(record.logDate),
        notes: (record.notes as string | null) ?? null,
        lockedAt: (record.lockedAt as string | null) ?? null,
        serverRevision: record.serverRevision as number,
      });
    } else if (entityType === "punch_item") {
      await upsertPunchItemFromServer({
        id: record.id as string,
        projectId,
        number: (record.number as string | null) ?? null,
        description: record.description as string,
        priority: record.priority as "low" | "medium" | "high",
        status: record.status as "open" | "ready_for_review" | "approved" | "closed",
        dueDate: (record.dueDate as string | null) ?? null,
        serverRevision: record.serverRevision as number,
      });
    } else if (entityType === "schedule_progress_update") {
      await upsertProgressUpdateFromServer({
        id: record.id as string,
        projectId,
        taskId: record.taskId as string,
        proposedPercentComplete: (record.proposedPercentComplete as number | null) ?? null,
        proposedActualStart: (record.proposedActualStart as string | null) ?? null,
        proposedActualFinish: (record.proposedActualFinish as string | null) ?? null,
        note: (record.note as string | null) ?? null,
        status: record.status as ProgressUpdateReviewStatus,
        rejectionReason: (record.rejectionReason as string | null) ?? null,
      });
    } else {
      // The generic pull record for an inspection doesn't carry its
      // response sub-rows (packages/db's inspections row has no such
      // column) — fetch the full detail once per pulled inspection.
      const detail = await apiJson<{ status: string; signedByName: string | null; signedAt: string | null; responses: { templateItemId: string; value: Record<string, unknown> }[] }>(
        `/inspections/${record.id as string}`,
      );
      await upsertInspectionFromServer({
        id: record.id as string,
        projectId,
        templateId: record.templateId as string,
        status: detail.status as "in_progress" | "completed",
        signedByName: detail.signedByName,
        signedAt: detail.signedAt,
        serverRevision: record.serverRevision as number,
        responses: detail.responses.map((r): LocalInspectionResponse => ({ templateItemId: r.templateItemId, value: r.value })),
      });
    }
  }

  await setSyncCursor(entityType, projectId, response.cursor);
}
