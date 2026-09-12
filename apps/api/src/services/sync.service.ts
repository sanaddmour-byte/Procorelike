import type { Database } from "@siteops/db";
import type { FieldConflict, PermissionContext, SyncEntityType, SyncPushRecord } from "@siteops/shared";
import * as dailyLogService from "./daily-log.service";
import * as punchItemService from "./punch-item.service";

export interface SyncPushRecordResult {
  localId: string;
  status: "applied" | "conflict" | "rejected";
  serverRevision?: number;
  conflicts?: FieldConflict[];
  reason?: string;
}

/** Applies each pushed record independently — one record's rejection/conflict never blocks the rest of the batch. */
export async function pushSyncRecords(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  entityType: SyncEntityType,
  records: SyncPushRecord[],
): Promise<SyncPushRecordResult[]> {
  const results: SyncPushRecordResult[] = [];
  for (const record of records) {
    const result =
      entityType === "daily_log"
        ? await dailyLogService.applyDailyLogPush(appDb, userId, ctx, projectId, record.localId, record.base, record.data)
        : await punchItemService.applyPunchItemPush(appDb, userId, ctx, projectId, record.localId, record.base, record.data);
    results.push({ localId: record.localId, ...result });
  }
  return results;
}

export async function pullSyncRecords(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  entityType: SyncEntityType,
  since: number,
): Promise<{ records: Record<string, unknown>[]; cursor: number }> {
  const records =
    entityType === "daily_log"
      ? await dailyLogService.listDailyLogsSince(appDb, userId, ctx, projectId, since)
      : await punchItemService.listPunchItemsSince(appDb, userId, ctx, projectId, since);

  const cursor = records.reduce((max, r) => Math.max(max, r.serverRevision), since);
  return { records, cursor };
}
