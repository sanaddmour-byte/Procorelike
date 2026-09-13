import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  hasPermission,
  requirePermission,
  type PermissionContext,
  type RejectScheduleProgressUpdateInput,
  type SubmitScheduleProgressUpdateInput,
} from "@siteops/shared";
import { eq, inArray } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { getCurrentScheduleWithTasks } from "./cpm-schedule.service";

type ScheduleProgressUpdateRow = typeof schema.scheduleProgressUpdates.$inferSelect;

export interface SyncApplyResult {
  status: "applied" | "conflict" | "rejected";
  serverRevision?: number;
  reason?: string;
}

/**
 * "read" on schedule is enough to submit -- this never mutates the
 * schedule itself, it only records a proposal (docs/SCHEDULING.md A6:
 * "never let a phone edit silently mutate the master schedule").
 */
export async function submitScheduleProgressUpdate(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: SubmitScheduleProgressUpdateInput,
): Promise<ScheduleProgressUpdateRow> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.scheduleProgressUpdates)
      .values({
        ...input,
        submittedBy: userId,
        proposedActualStart: input.proposedActualStart ? new Date(input.proposedActualStart) : undefined,
        proposedActualFinish: input.proposedActualFinish ? new Date(input.proposedActualFinish) : undefined,
      })
      .returning();
    if (!row) throw new Error("Failed to submit progress update");
    return row;
  });
}

/** The planner's review queue -- current-version tasks only, same reasoning as listScheduleConstraintsForProject. */
export async function listPendingProgressUpdates(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ScheduleProgressUpdateRow[]> {
  requirePermission(ctx, "schedule", "standard");
  const current = await getCurrentScheduleWithTasks(appDb, userId, ctx, projectId);
  if (!current || current.tasks.length === 0) return [];
  const taskIds = current.tasks.map((t) => t.id);
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx.select().from(schema.scheduleProgressUpdates).where(inArray(schema.scheduleProgressUpdates.taskId, taskIds));
    return rows.filter((r) => r.status === "pending");
  });
}

export async function findProgressUpdateProjectId(appDb: Database, userId: string, updateId: string): Promise<string | undefined> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [row] = await tx
      .select({ projectId: schema.schedules.projectId })
      .from(schema.scheduleProgressUpdates)
      .innerJoin(schema.cpmScheduleTasks, eq(schema.cpmScheduleTasks.id, schema.scheduleProgressUpdates.taskId))
      .innerJoin(schema.scheduleVersions, eq(schema.scheduleVersions.id, schema.cpmScheduleTasks.versionId))
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.scheduleVersions.scheduleId))
      .where(eq(schema.scheduleProgressUpdates.id, updateId))
      .limit(1);
    return row?.projectId;
  });
}

/** The one place a field submission actually reaches the schedule: only once a planner accepts it, and only the fields that were proposed. */
export async function acceptScheduleProgressUpdate(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  updateId: string,
): Promise<ScheduleProgressUpdateRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [update] = await tx.select().from(schema.scheduleProgressUpdates).where(eq(schema.scheduleProgressUpdates.id, updateId)).limit(1);
    if (!update) throw new NotFoundError("Progress update not found");
    if (update.status !== "pending") throw new ApiError(409, "already_reviewed", "This progress update has already been reviewed");

    const taskChanges: Partial<typeof schema.cpmScheduleTasks.$inferInsert> = {};
    if (update.proposedPercentComplete !== null) taskChanges.percentComplete = update.proposedPercentComplete;
    if (update.proposedActualStart !== null) taskChanges.actualStart = update.proposedActualStart;
    if (update.proposedActualFinish !== null) taskChanges.actualFinish = update.proposedActualFinish;
    if (Object.keys(taskChanges).length > 0) {
      await tx.update(schema.cpmScheduleTasks).set(taskChanges).where(eq(schema.cpmScheduleTasks.id, update.taskId));
    }

    const [row] = await tx
      .update(schema.scheduleProgressUpdates)
      .set({ status: "accepted", reviewedBy: userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.scheduleProgressUpdates.id, updateId))
      .returning();
    if (!row) throw new NotFoundError("Progress update not found");
    return row;
  });
}

export async function rejectScheduleProgressUpdate(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  updateId: string,
  input: RejectScheduleProgressUpdateInput,
): Promise<ScheduleProgressUpdateRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [update] = await tx.select().from(schema.scheduleProgressUpdates).where(eq(schema.scheduleProgressUpdates.id, updateId)).limit(1);
    if (!update) throw new NotFoundError("Progress update not found");
    if (update.status !== "pending") throw new ApiError(409, "already_reviewed", "This progress update has already been reviewed");

    const [row] = await tx
      .update(schema.scheduleProgressUpdates)
      .set({
        status: "rejected",
        reviewedBy: userId,
        reviewedAt: new Date(),
        rejectionReason: input.rejectionReason,
        updatedAt: new Date(),
      })
      .where(eq(schema.scheduleProgressUpdates.id, updateId))
      .returning();
    if (!row) throw new NotFoundError("Progress update not found");
    return row;
  });
}

/**
 * Mobile sync push handler. Create-only: a progress update is never edited
 * after submission (only accepted/rejected by a planner, which is a
 * web-only action, not synced), so there is no merge/conflict path here --
 * unlike daily logs, retrying a push for an already-synced record is
 * simply a no-op "applied".
 */
export async function applyScheduleProgressUpdatePush(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  localId: string,
  _base: Record<string, unknown> | null,
  data: Record<string, unknown>,
): Promise<SyncApplyResult> {
  if (!hasPermission(ctx, "schedule", "read")) {
    return { status: "rejected", reason: "permission_denied" };
  }
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.scheduleProgressUpdates)
      .where(eq(schema.scheduleProgressUpdates.id, localId))
      .limit(1);
    if (existing) {
      return { status: "applied", serverRevision: existing.serverRevision };
    }

    const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
    if (!taskId) return { status: "rejected", reason: "missing_task_id" };

    const [taskProject] = await tx
      .select({ projectId: schema.schedules.projectId })
      .from(schema.cpmScheduleTasks)
      .innerJoin(schema.scheduleVersions, eq(schema.scheduleVersions.id, schema.cpmScheduleTasks.versionId))
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.scheduleVersions.scheduleId))
      .where(eq(schema.cpmScheduleTasks.id, taskId))
      .limit(1);
    if (!taskProject || taskProject.projectId !== projectId) {
      return { status: "rejected", reason: "task_not_in_project" };
    }

    const [row] = await tx
      .insert(schema.scheduleProgressUpdates)
      .values({
        id: localId,
        taskId,
        submittedBy: userId,
        proposedPercentComplete: typeof data.proposedPercentComplete === "number" ? data.proposedPercentComplete : undefined,
        proposedActualStart: typeof data.proposedActualStart === "string" ? new Date(data.proposedActualStart) : undefined,
        proposedActualFinish: typeof data.proposedActualFinish === "string" ? new Date(data.proposedActualFinish) : undefined,
        note: typeof data.note === "string" ? data.note : undefined,
        photoAttachmentId: typeof data.photoAttachmentId === "string" ? data.photoAttachmentId : undefined,
      })
      .returning();
    if (!row) return { status: "rejected", reason: "insert_failed" };
    return { status: "applied", serverRevision: row.serverRevision };
  });
}

/** Mobile sync pull handler -- scoped to the project via a join through the current task/version/schedule chain (this table has no direct projectId column). */
export async function listScheduleProgressUpdatesSince(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  sinceRevision: number,
): Promise<ScheduleProgressUpdateRow[]> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx
      .select({ update: schema.scheduleProgressUpdates })
      .from(schema.scheduleProgressUpdates)
      .innerJoin(schema.cpmScheduleTasks, eq(schema.cpmScheduleTasks.id, schema.scheduleProgressUpdates.taskId))
      .innerJoin(schema.scheduleVersions, eq(schema.scheduleVersions.id, schema.cpmScheduleTasks.versionId))
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.scheduleVersions.scheduleId))
      .where(eq(schema.schedules.projectId, projectId));
    return rows.map((r) => r.update).filter((r) => r.serverRevision > sinceRevision);
  });
}
