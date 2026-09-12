import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  canEditOwnedRecord,
  hasPermission,
  mergeFields,
  PermissionDeniedError,
  requirePermission,
  type CreateDailyLogInput,
  type FieldConflict,
  type PermissionContext,
  type UpdateDailyLogInput,
} from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { fetchWeather } from "../lib/weather";

type DailyLogRow = typeof schema.dailyLogs.$inferSelect;

async function replaceManpower(
  tx: Tx,
  dailyLogId: string,
  rows: CreateDailyLogInput["manpower"],
): Promise<void> {
  await tx.delete(schema.dailyLogManpower).where(eq(schema.dailyLogManpower.dailyLogId, dailyLogId));
  if (rows.length > 0) {
    await tx
      .insert(schema.dailyLogManpower)
      .values(rows.map((r) => ({ ...r, dailyLogId, hours: r.hours.toString() })));
  }
}

async function replaceEquipment(
  tx: Tx,
  dailyLogId: string,
  rows: CreateDailyLogInput["equipment"],
): Promise<void> {
  await tx.delete(schema.dailyLogEquipment).where(eq(schema.dailyLogEquipment.dailyLogId, dailyLogId));
  if (rows.length > 0) {
    await tx.insert(schema.dailyLogEquipment).values(
      rows.map((r) => ({
        ...r,
        dailyLogId,
        hours: r.hours !== undefined ? r.hours.toString() : undefined,
      })),
    );
  }
}

async function replaceDeliveries(
  tx: Tx,
  dailyLogId: string,
  rows: CreateDailyLogInput["deliveries"],
): Promise<void> {
  await tx.delete(schema.dailyLogDeliveries).where(eq(schema.dailyLogDeliveries.dailyLogId, dailyLogId));
  if (rows.length > 0) {
    await tx.insert(schema.dailyLogDeliveries).values(rows.map((r) => ({ ...r, dailyLogId })));
  }
}

async function replaceDelays(
  tx: Tx,
  dailyLogId: string,
  rows: CreateDailyLogInput["delays"],
): Promise<void> {
  await tx.delete(schema.dailyLogDelays).where(eq(schema.dailyLogDelays.dailyLogId, dailyLogId));
  if (rows.length > 0) {
    await tx.insert(schema.dailyLogDelays).values(
      rows.map((r) => ({
        ...r,
        dailyLogId,
        hoursImpact: r.hoursImpact !== undefined ? r.hoursImpact.toString() : undefined,
      })),
    );
  }
}

export async function createDailyLog(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectLat: number | null,
  projectLng: number | null,
  input: CreateDailyLogInput,
): Promise<DailyLogRow> {
  requirePermission(ctx, "daily_log", "standard");

  const weatherJson =
    input.weatherJson ?? (projectLat !== null && projectLng !== null ? await fetchWeather(projectLat, projectLng, input.logDate) : null);

  try {
    return await withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
      const [log] = await tx
        .insert(schema.dailyLogs)
        .values({
          projectId: input.projectId,
          logDate: new Date(input.logDate),
          notes: input.notes,
          weatherJson,
          createdBy: userId,
        })
        .returning();
      if (!log) throw new Error("Failed to create daily log");

      await replaceManpower(tx, log.id, input.manpower);
      await replaceEquipment(tx, log.id, input.equipment);
      await replaceDeliveries(tx, log.id, input.deliveries);
      await replaceDelays(tx, log.id, input.delays);

      await writeAuditLog(tx, {
        actorId: userId,
        entityType: "daily_log",
        entityId: log.id,
        action: "create",
        after: log,
      });

      return log;
    });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      throw new ApiError(409, "daily_log_exists", "A daily log already exists for this project and date");
    }
    throw err;
  }
}

/** Looks up a daily log by id, scoped to what this user can see — used by routes to resolve which project a record belongs to before loading the full permission context for it. */
export async function findDailyLogById(
  appDb: Database,
  userId: string,
  dailyLogId: string,
): Promise<DailyLogRow | undefined> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [log] = await tx.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.id, dailyLogId)).limit(1);
    return log;
  });
}

export async function listDailyLogs(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<DailyLogRow[]> {
  requirePermission(ctx, "daily_log", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.projectId, projectId));
  });
}

export interface DailyLogDetail extends DailyLogRow {
  manpower: (typeof schema.dailyLogManpower.$inferSelect)[];
  equipment: (typeof schema.dailyLogEquipment.$inferSelect)[];
  deliveries: (typeof schema.dailyLogDeliveries.$inferSelect)[];
  delays: (typeof schema.dailyLogDelays.$inferSelect)[];
}

export async function getDailyLog(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  dailyLogId: string,
): Promise<DailyLogDetail> {
  requirePermission(ctx, "daily_log", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [log] = await tx.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.id, dailyLogId)).limit(1);
    if (!log) throw new NotFoundError("Daily log not found");

    const [manpower, equipment, deliveries, delays] = await Promise.all([
      tx.select().from(schema.dailyLogManpower).where(eq(schema.dailyLogManpower.dailyLogId, dailyLogId)),
      tx.select().from(schema.dailyLogEquipment).where(eq(schema.dailyLogEquipment.dailyLogId, dailyLogId)),
      tx.select().from(schema.dailyLogDeliveries).where(eq(schema.dailyLogDeliveries.dailyLogId, dailyLogId)),
      tx.select().from(schema.dailyLogDelays).where(eq(schema.dailyLogDelays.dailyLogId, dailyLogId)),
    ]);

    return { ...log, manpower, equipment, deliveries, delays };
  });
}

export async function updateDailyLog(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  dailyLogId: string,
  input: UpdateDailyLogInput,
): Promise<DailyLogRow> {
  requirePermission(ctx, "daily_log", "standard");

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.id, dailyLogId)).limit(1);
    if (!existing) throw new NotFoundError("Daily log not found");
    if (!canEditOwnedRecord(ctx, "daily_log", existing, userId)) {
      throw new PermissionDeniedError("daily_log", "admin");
    }
    // A locked (submitted) log can only be edited by reopening it first —
    // an explicit `locked: false`, and only an admin-level caller may do
    // that. Any other edit attempt on a locked log is rejected outright.
    if (existing.lockedAt) {
      if (input.locked === false) {
        if (!hasPermission(ctx, "daily_log", "admin")) {
          throw new PermissionDeniedError("daily_log", "admin");
        }
      } else {
        throw new ApiError(
          409,
          "daily_log_locked",
          "This daily log is locked. Reopen it (locked: false, admin only) before editing.",
        );
      }
    }

    const { manpower, equipment, deliveries, delays, locked, ...fields } = input;

    const [updated] = await tx
      .update(schema.dailyLogs)
      .set({
        ...fields,
        ...(locked === true ? { lockedAt: new Date(), signedBy: userId } : {}),
        ...(locked === false ? { lockedAt: null, signedBy: null } : {}),
        updatedAt: new Date(),
        updatedBy: userId,
        // A direct, authoritative edit resolves any pending sync conflict —
        // the user has now explicitly confirmed the current value.
        needsReview: false,
        conflictData: null,
      })
      .where(eq(schema.dailyLogs.id, dailyLogId))
      .returning();
    if (!updated) throw new Error("Failed to update daily log");

    if (manpower) await replaceManpower(tx, dailyLogId, manpower);
    if (equipment) await replaceEquipment(tx, dailyLogId, equipment);
    if (deliveries) await replaceDeliveries(tx, dailyLogId, deliveries);
    if (delays) await replaceDelays(tx, dailyLogId, delays);

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "daily_log",
      entityId: dailyLogId,
      action: "update",
      before: existing,
      after: updated,
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Offline sync path (docs/ARCHITECTURE.md §6) — used by POST /sync/push,
// not by the direct web CRUD endpoints above. See packages/shared's
// mergeFields for the 3-way per-field conflict algorithm.
// ---------------------------------------------------------------------------

export interface SyncApplyResult {
  status: "applied" | "conflict" | "rejected";
  serverRevision?: number;
  conflicts?: FieldConflict[];
  reason?: string;
}

export async function applyDailyLogPush(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  localId: string,
  base: Record<string, unknown> | null,
  data: Record<string, unknown>,
): Promise<SyncApplyResult> {
  if (!hasPermission(ctx, "daily_log", "standard")) {
    return { status: "rejected", reason: "permission_denied" };
  }

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.id, localId)).limit(1);

    if (!existing) {
      // Brand-new record created offline.
      try {
        const logDate = data.logDate ? new Date(data.logDate as string) : new Date();
        const [log] = await tx
          .insert(schema.dailyLogs)
          .values({
            id: localId,
            projectId,
            logDate,
            notes: typeof data.notes === "string" ? data.notes : undefined,
            weatherJson: data.weatherJson ?? null,
            createdBy: userId,
          })
          .returning();
        if (!log) return { status: "rejected", reason: "insert_failed" };

        if (Array.isArray(data.manpower)) {
          await replaceManpower(tx, log.id, data.manpower as CreateDailyLogInput["manpower"]);
        }
        await writeAuditLog(tx, { actorId: userId, entityType: "daily_log", entityId: log.id, action: "create", after: log });
        return { status: "applied", serverRevision: log.serverRevision };
      } catch (err) {
        if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
          return { status: "rejected", reason: "daily_log_exists_for_date" };
        }
        throw err;
      }
    }

    if (existing.projectId !== projectId) {
      return { status: "rejected", reason: "not_found" };
    }

    const { merged, conflicts } = mergeFields(base, data, existing as unknown as Record<string, unknown>);

    const columnUpdates: Record<string, unknown> = {};
    if ("notes" in merged) columnUpdates.notes = merged.notes;
    if ("weatherJson" in merged) columnUpdates.weatherJson = merged.weatherJson;

    const [updated] = await tx
      .update(schema.dailyLogs)
      .set({
        ...columnUpdates,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
        needsReview: conflicts.length > 0,
        conflictData: conflicts.length > 0 ? conflicts : null,
      })
      .where(eq(schema.dailyLogs.id, localId))
      .returning();
    if (!updated) return { status: "rejected", reason: "update_failed" };

    if (Array.isArray(merged.manpower)) {
      await replaceManpower(tx, localId, merged.manpower as CreateDailyLogInput["manpower"]);
    }

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "daily_log",
      entityId: localId,
      action: "sync_push",
      before: existing,
      after: updated,
    });

    return {
      status: conflicts.length > 0 ? "conflict" : "applied",
      serverRevision: updated.serverRevision,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    };
  });
}

export async function listDailyLogsSince(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  sinceRevision: number,
): Promise<DailyLogRow[]> {
  requirePermission(ctx, "daily_log", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx.select().from(schema.dailyLogs).where(and(eq(schema.dailyLogs.projectId, projectId)));
    return rows.filter((r) => r.serverRevision > sinceRevision);
  });
}
