import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  DEFAULT_PAGE_SIZE,
  requirePermission,
  SCHEDULE_TASK_STATUS_TRANSITIONS,
  type CreateScheduleTaskInput,
  type ListScheduleTasksQuery,
  type PaginatedResult,
  type PermissionContext,
  type ScheduleTaskSortKey,
  type TransitionScheduleTaskStatusInput,
  type UpdateScheduleTaskInput,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type ScheduleTaskRow = typeof schema.scheduleTasks.$inferSelect;

export async function createScheduleTask(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateScheduleTaskInput,
): Promise<ScheduleTaskRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.scheduleTasks)
      .values({ ...input, createdBy: userId })
      .returning();
    if (!row) throw new Error("Failed to create schedule task");

    await writeAuditLog(tx, { actorId: userId, entityType: "schedule_task", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project a task belongs to before loading the full permission context. */
export async function findScheduleTaskById(
  appDb: Database,
  userId: string,
  taskId: string,
): Promise<ScheduleTaskRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.scheduleTasks).where(eq(schema.scheduleTasks.id, taskId)).limit(1);
    return row;
  });
}

const SCHEDULE_TASK_SORT_COLUMNS: Record<
  ScheduleTaskSortKey,
  | typeof schema.scheduleTasks.name
  | typeof schema.scheduleTasks.status
  | typeof schema.scheduleTasks.percentComplete
  | typeof schema.scheduleTasks.startDate
> = {
  name: schema.scheduleTasks.name,
  status: schema.scheduleTasks.status,
  percentComplete: schema.scheduleTasks.percentComplete,
  startDate: schema.scheduleTasks.startDate,
};

export async function listScheduleTasks(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListScheduleTasksQuery = {},
): Promise<PaginatedResult<ScheduleTaskRow>> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.scheduleTasks.projectId, projectId)];

    if (query.status) conditions.push(eq(schema.scheduleTasks.status, query.status));
    if (query.search) conditions.push(ilike(schema.scheduleTasks.name, `%${query.search}%`));
    const where = and(...conditions)!;

    // No explicit sort: keep this list's original ordering (manual sortOrder,
    // then startDate) rather than falling back to a single-column default --
    // the only migrated module whose pre-migration order wasn't one column.
    const orderFn = query.direction === "desc" ? desc : asc;
    const orderByClauses = query.sort ? [orderFn(SCHEDULE_TASK_SORT_COLUMNS[query.sort])] : [asc(schema.scheduleTasks.sortOrder), asc(schema.scheduleTasks.startDate)];

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.scheduleTasks).where(where).orderBy(...orderByClauses);
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.scheduleTasks).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function updateScheduleTask(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  taskId: string,
  input: UpdateScheduleTaskInput,
): Promise<ScheduleTaskRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.scheduleTasks).where(eq(schema.scheduleTasks.id, taskId)).limit(1);
    if (!existing) throw new NotFoundError("Schedule task not found");

    const [updated] = await tx
      .update(schema.scheduleTasks)
      .set({ ...input, serverRevision: existing.serverRevision + 1, updatedAt: new Date(), updatedBy: userId })
      .where(eq(schema.scheduleTasks.id, taskId))
      .returning();
    if (!updated) throw new Error("Failed to update schedule task");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "schedule_task",
      entityId: taskId,
      action: "update",
      before: existing,
      after: updated,
    });
    return updated;
  });
}

export async function transitionScheduleTaskStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  taskId: string,
  input: TransitionScheduleTaskStatusInput,
): Promise<ScheduleTaskRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.scheduleTasks).where(eq(schema.scheduleTasks.id, taskId)).limit(1);
    if (!existing) throw new NotFoundError("Schedule task not found");

    const allowed = SCHEDULE_TASK_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(
        409,
        "invalid_status_transition",
        `Cannot move a schedule task from '${existing.status}' to '${input.toStatus}'`,
      );
    }

    const [updated] = await tx
      .update(schema.scheduleTasks)
      .set({
        status: input.toStatus,
        percentComplete: input.toStatus === "complete" ? 100 : existing.percentComplete,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(schema.scheduleTasks.id, taskId))
      .returning();
    if (!updated) throw new Error("Failed to transition schedule task");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "schedule_task",
      entityId: taskId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
