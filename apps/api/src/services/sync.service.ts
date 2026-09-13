import type { Database } from "@siteops/db";
import type { FieldConflict, PermissionContext, SyncEntityType, SyncPushRecord } from "@siteops/shared";
import * as dailyLogService from "./daily-log.service";
import * as inspectionService from "./inspection.service";
import * as punchItemService from "./punch-item.service";
import * as scheduleProgressService from "./schedule-progress.service";

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
    const result = await applyPush(appDb, userId, ctx, projectId, entityType, record);
    results.push({ localId: record.localId, ...result });
  }
  return results;
}

function applyPush(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  entityType: SyncEntityType,
  record: SyncPushRecord,
) {
  switch (entityType) {
    case "daily_log":
      return dailyLogService.applyDailyLogPush(appDb, userId, ctx, projectId, record.localId, record.base, record.data);
    case "punch_item":
      return punchItemService.applyPunchItemPush(appDb, userId, ctx, projectId, record.localId, record.base, record.data);
    case "inspection":
      return inspectionService.applyInspectionPush(appDb, userId, ctx, projectId, record.localId, record.base, record.data);
    case "schedule_progress_update":
      return scheduleProgressService.applyScheduleProgressUpdatePush(appDb, userId, ctx, projectId, record.localId, record.base, record.data);
  }
}

export async function pullSyncRecords(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  entityType: SyncEntityType,
  since: number,
): Promise<{ records: Record<string, unknown>[]; cursor: number }> {
  const records = await listSince(appDb, userId, ctx, projectId, entityType, since);

  const cursor = records.reduce((max, r) => Math.max(max, r.serverRevision), since);
  return { records, cursor };
}

function listSince(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  entityType: SyncEntityType,
  since: number,
) {
  switch (entityType) {
    case "daily_log":
      return dailyLogService.listDailyLogsSince(appDb, userId, ctx, projectId, since);
    case "punch_item":
      return punchItemService.listPunchItemsSince(appDb, userId, ctx, projectId, since);
    case "inspection":
      return inspectionService.listInspectionsSince(appDb, userId, ctx, projectId, since);
    case "schedule_progress_update":
      return scheduleProgressService.listScheduleProgressUpdatesSince(appDb, userId, ctx, projectId, since);
  }
}
