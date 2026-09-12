import type { FieldConflict } from "@siteops/shared";
import { apiJson } from "../api-client";
import {
  getDailyLog,
  getDailyLogBaseSnapshot,
  markDailyLogConflict,
  markDailyLogSynced,
  upsertDailyLogFromServer,
} from "../db/daily-log-repo";
import { dequeueOutbox, getSyncCursor, listOutbox, setLastSyncedAt, setSyncCursor, type OutboxEntry, type SyncEntityType } from "../db/outbox-repo";
import {
  getPunchItem,
  getPunchItemBaseSnapshot,
  markPunchItemConflict,
  markPunchItemSynced,
  upsertPunchItemFromServer,
} from "../db/punch-item-repo";

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

/**
 * Drains the outbox (push), then pulls anything changed server-side since
 * the last cursor, for both offline-capable entity types. Called on a
 * manual "Sync now" tap and opportunistically (app foreground / after a
 * successful mutation) — see docs/ARCHITECTURE.md §6. Any network failure
 * degrades to `ranOffline: true` rather than throwing: everything that
 * wasn't pushed/pulled simply stays queued for the next attempt.
 */
export async function syncProject(projectId: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, rejected: 0, ranOffline: false };

  try {
    await pushOutbox(projectId, "daily_log", result);
    await pushOutbox(projectId, "punch_item", result);
    await pullEntity(projectId, "daily_log", result);
    await pullEntity(projectId, "punch_item", result);
    await setLastSyncedAt(new Date().toISOString());
  } catch {
    result.ranOffline = true;
  }

  return result;
}

async function pushOutbox(projectId: string, entityType: SyncEntityType, result: SyncResult): Promise<void> {
  const allEntries = await listOutbox(projectId);
  const entries: OutboxEntry[] = allEntries.filter((e) => e.entityType === entityType);
  if (entries.length === 0) return;

  const records = await Promise.all(
    entries.map(async (entry) => {
      if (entityType === "daily_log") {
        const log = await getDailyLog(entry.localId);
        const base = await getDailyLogBaseSnapshot(entry.localId);
        return {
          localId: entry.localId,
          baseRevision: log?.baseRevision ?? null,
          base,
          data: { logDate: log?.logDate, notes: log?.notes ?? null },
        };
      }
      const item = await getPunchItem(entry.localId);
      const base = await getPunchItemBaseSnapshot(entry.localId);
      return {
        localId: entry.localId,
        baseRevision: item?.baseRevision ?? null,
        base,
        data: { description: item?.description ?? "" },
      };
    }),
  );

  const response = await apiJson<{ results: SyncPushRecordResult[] }>("/sync/push", {
    method: "POST",
    body: JSON.stringify({ projectId, entityType, records }),
  });

  for (const r of response.results) {
    await dequeueOutbox(`${entityType}:${r.localId}`);

    if (r.status === "applied" && r.serverRevision !== undefined) {
      result.pushed += 1;
      if (entityType === "daily_log") {
        const log = await getDailyLog(r.localId);
        await markDailyLogSynced(r.localId, r.serverRevision, {
          notes: log?.notes ?? null,
          lockedAt: log?.lockedAt ?? null,
        });
      } else {
        const item = await getPunchItem(r.localId);
        await markPunchItemSynced(r.localId, r.serverRevision, {
          number: item?.number ?? null,
          description: item?.description ?? "",
          status: item?.status ?? "open",
        });
      }
    } else if (r.status === "conflict" && r.serverRevision !== undefined) {
      result.conflicts += 1;
      if (entityType === "daily_log") {
        const server = await apiJson<{ notes: string | null }>(`/daily-logs/${r.localId}`);
        await markDailyLogConflict(r.localId, r.serverRevision, r.conflicts ?? [], server.notes);
      } else {
        const server = await apiJson<{ description: string }>(`/punch-items/${r.localId}`);
        await markPunchItemConflict(r.localId, r.serverRevision, r.conflicts ?? [], server.description);
      }
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
    } else {
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
    }
  }

  await setSyncCursor(entityType, projectId, response.cursor);
}
