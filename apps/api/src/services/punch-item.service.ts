import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  canEditOwnedRecord,
  DEFAULT_PAGE_SIZE,
  formatPunchItemNumber,
  hasPermission,
  mergeFields,
  PermissionDeniedError,
  PUNCH_ITEM_STATUS_TRANSITIONS,
  requirePermission,
  resolveEffectiveLevel,
  type BulkTransitionPunchItemStatusInput,
  type CreatePunchItemInput,
  type FieldConflict,
  type ListPunchItemsQuery,
  type PaginatedResult,
  type PermissionContext,
  type PunchItemSortKey,
  type TransitionPunchItemStatusInput,
  type UpdatePunchItemInput,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import type { SyncApplyResult } from "./daily-log.service";
import { notifyUsers } from "./notification.service";
import { loadPermissionContext, withUserContext } from "./permission.service";
import { enforceWorkflowTransitionRule } from "./workflow-rule.service";

type PunchItemRow = typeof schema.punchItems.$inferSelect;
type PunchItemDistributionRow = typeof schema.punchItemDistribution.$inferSelect;

export interface PunchItemDetail extends PunchItemRow {
  history: (typeof schema.punchItemHistory.$inferSelect)[];
  distribution: PunchItemDistributionRow[];
}

export async function createPunchItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreatePunchItemInput,
): Promise<PunchItemRow> {
  requirePermission(ctx, "punch_list", "standard");

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const { distributionUserIds, distributionCompanyIds, ...fields } = input;
    const seq = await nextSequenceNumber(tx, input.projectId, "PI");
    const [item] = await tx
      .insert(schema.punchItems)
      .values({
        ...fields,
        number: formatPunchItemNumber(seq),
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        createdBy: userId,
      })
      .returning();
    if (!item) throw new Error("Failed to create punch item");

    const distributionRows = [
      ...distributionUserIds.map((distUserId) => ({ punchItemId: item.id, userId: distUserId })),
      ...distributionCompanyIds.map((companyId) => ({ punchItemId: item.id, companyId })),
    ];
    if (distributionRows.length > 0) {
      await tx.insert(schema.punchItemDistribution).values(distributionRows);
    }

    await tx.insert(schema.punchItemHistory).values({
      punchItemId: item.id,
      toStatus: "open",
      changedBy: userId,
      note: "Created",
    });

    await writeAuditLog(tx, { actorId: userId, entityType: "punch_item", entityId: item.id, action: "create", after: item });
    await notifyUsers(tx, [item.assigneeUserId, item.finalApproverUserId, ...distributionUserIds], userId, "punch_item_assigned", {
      projectId: item.projectId,
      entityType: "punch_item",
      entityId: item.id,
      summary: `Punch item ${item.number}: ${item.description}`,
    });
    return item;
  });
}

/** Looks up a punch item by id, scoped to what this user can see — used by routes to resolve which project a record belongs to before loading the full permission context for it. */
export async function findPunchItemById(
  appDb: Database,
  userId: string,
  punchItemId: string,
): Promise<PunchItemRow | undefined> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [item] = await tx.select().from(schema.punchItems).where(eq(schema.punchItems.id, punchItemId)).limit(1);
    return item;
  });
}

const PUNCH_ITEM_SORT_COLUMNS: Record<
  PunchItemSortKey,
  typeof schema.punchItems.number | typeof schema.punchItems.description | typeof schema.punchItems.status | typeof schema.punchItems.priority | typeof schema.punchItems.dueDate
> = {
  number: schema.punchItems.number,
  description: schema.punchItems.description,
  status: schema.punchItems.status,
  priority: schema.punchItems.priority,
  dueDate: schema.punchItems.dueDate,
};

export async function listPunchItems(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListPunchItemsQuery = {},
): Promise<PaginatedResult<PunchItemRow>> {
  requirePermission(ctx, "punch_list", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.punchItems.projectId, projectId)];

    if (query.status) conditions.push(eq(schema.punchItems.status, query.status));
    if (query.assigneeUserId) conditions.push(eq(schema.punchItems.assigneeUserId, query.assigneeUserId));
    if (query.search) {
      conditions.push(or(ilike(schema.punchItems.description, `%${query.search}%`), ilike(schema.punchItems.number, `%${query.search}%`))!);
    }
    const where = and(...conditions)!;

    const sortColumn = PUNCH_ITEM_SORT_COLUMNS[query.sort ?? "number"];
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.punchItems).where(where).orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.punchItems).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function getPunchItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  punchItemId: string,
): Promise<PunchItemDetail> {
  requirePermission(ctx, "punch_list", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [item] = await tx.select().from(schema.punchItems).where(eq(schema.punchItems.id, punchItemId)).limit(1);
    if (!item) throw new NotFoundError("Punch item not found");
    const [history, distribution] = await Promise.all([
      tx.select().from(schema.punchItemHistory).where(eq(schema.punchItemHistory.punchItemId, punchItemId)),
      tx.select().from(schema.punchItemDistribution).where(eq(schema.punchItemDistribution.punchItemId, punchItemId)),
    ]);
    return { ...item, history, distribution };
  });
}

export async function updatePunchItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  punchItemId: string,
  input: UpdatePunchItemInput,
): Promise<PunchItemRow> {
  requirePermission(ctx, "punch_list", "standard");

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.punchItems).where(eq(schema.punchItems.id, punchItemId)).limit(1);
    if (!existing) throw new NotFoundError("Punch item not found");
    if (!canEditOwnedRecord(ctx, "punch_list", existing, userId)) {
      throw new PermissionDeniedError("punch_list", "admin");
    }

    const [updated] = await tx
      .update(schema.punchItems)
      .set({
        ...input,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
        // A direct, authoritative edit resolves any pending sync conflict —
        // the user has now explicitly confirmed the current value.
        needsReview: false,
        conflictData: null,
      })
      .where(eq(schema.punchItems.id, punchItemId))
      .returning();
    if (!updated) throw new Error("Failed to update punch item");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "punch_item",
      entityId: punchItemId,
      action: "update",
      before: existing,
      after: updated,
    });
    if (input.assigneeUserId && input.assigneeUserId !== existing.assigneeUserId) {
      await notifyUsers(tx, [updated.assigneeUserId], userId, "punch_item_assigned", {
        projectId: updated.projectId,
        entityType: "punch_item",
        entityId: updated.id,
        summary: `Punch item ${updated.number}: ${updated.description}`,
      });
    }
    return updated;
  });
}

export async function transitionPunchItemStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  punchItemId: string,
  input: TransitionPunchItemStatusInput,
): Promise<PunchItemRow> {
  requirePermission(ctx, "punch_list", "standard");

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.punchItems).where(eq(schema.punchItems.id, punchItemId)).limit(1);
    if (!existing) throw new NotFoundError("Punch item not found");

    const allowed = PUNCH_ITEM_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(
        409,
        "invalid_status_transition",
        `Cannot move a punch item from '${existing.status}' to '${input.toStatus}'`,
      );
    }
    await enforceWorkflowTransitionRule(tx, ctx, "punch_list", existing.projectId, existing.status, input.toStatus);

    // Procore's Final Approver role: once one is assigned, only that person
    // (or someone with admin-level punch_list permission) may sign off the
    // "approved" transition -- the assignee alone can't self-approve their fix.
    if (
      input.toStatus === "approved" &&
      existing.finalApproverUserId &&
      existing.finalApproverUserId !== userId &&
      resolveEffectiveLevel(ctx, "punch_list") !== "admin"
    ) {
      throw new PermissionDeniedError("punch_list", "admin");
    }

    const [updated] = await tx
      .update(schema.punchItems)
      .set({ status: input.toStatus, serverRevision: existing.serverRevision + 1, updatedAt: new Date(), updatedBy: userId })
      .where(eq(schema.punchItems.id, punchItemId))
      .returning();
    if (!updated) throw new Error("Failed to transition punch item");

    await tx.insert(schema.punchItemHistory).values({
      punchItemId,
      fromStatus: existing.status,
      toStatus: input.toStatus,
      changedBy: userId,
      note: input.note,
    });

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "punch_item",
      entityId: punchItemId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    await notifyUsers(
      tx,
      [updated.assigneeUserId, updated.finalApproverUserId, updated.createdBy],
      userId,
      "punch_item_status_changed",
      {
        projectId: updated.projectId,
        entityType: "punch_item",
        entityId: updated.id,
        summary: `Punch item ${updated.number}: ${updated.description} — ${updated.status}`,
      },
    );
    return updated;
  });
}

export interface BulkTransitionResult {
  id: string;
  ok: boolean;
  error?: string;
}

/**
 * Phase 31: bulk status transition for Punch Items, same recipe as
 * rfi.service.ts's bulkTransitionRfiStatus (Phase 28) -- a thin loop over
 * the exact same transitionPunchItemStatus a single-item PATCH already
 * uses, so PUNCH_ITEM_STATUS_TRANSITIONS, the Final Approver check,
 * workflow rules, and the audit log write all apply per row here too.
 *
 * Every id must belong to the same project: a bulk action only ever
 * targets rows a user selected on one list page (one project's worth),
 * and loading a single PermissionContext for a mix of projects would
 * apply the wrong project's role to some rows. A missing id or a rule
 * violation on one row (e.g. that item can't move to the requested
 * status, or the caller isn't its Final Approver) is reported per-row
 * instead of failing the batch.
 */
export async function bulkTransitionPunchItemStatus(
  appDb: Database,
  userId: string,
  input: BulkTransitionPunchItemStatusInput,
): Promise<BulkTransitionResult[]> {
  const rows = await withUserContext(appDb, userId, async (tx) => {
    return tx
      .select({ id: schema.punchItems.id, projectId: schema.punchItems.projectId })
      .from(schema.punchItems)
      .where(inArray(schema.punchItems.id, input.ids));
  });
  if (rows.length === 0) throw new NotFoundError("No punch items found for the given ids");

  const projectIds = new Set(rows.map((r) => r.projectId));
  if (projectIds.size > 1) {
    throw new ApiError(400, "mixed_projects", "All selected punch items must belong to the same project");
  }
  const [projectId] = projectIds;
  const ctx = await loadPermissionContext(appDb, userId, projectId!);
  const foundIds = new Set(rows.map((r) => r.id));

  const results: BulkTransitionResult[] = [];
  for (const id of input.ids) {
    if (!foundIds.has(id)) {
      results.push({ id, ok: false, error: "Punch item not found" });
      continue;
    }
    try {
      await transitionPunchItemStatus(appDb, userId, ctx, id, { toStatus: input.toStatus });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof ApiError ? err.message : "Failed to transition this punch item" });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Offline sync path — see daily-log.service.ts for the shared design notes.
// ---------------------------------------------------------------------------

export async function applyPunchItemPush(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  localId: string,
  base: Record<string, unknown> | null,
  data: Record<string, unknown>,
): Promise<SyncApplyResult> {
  if (!hasPermission(ctx, "punch_list", "standard")) {
    return { status: "rejected", reason: "permission_denied" };
  }

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.punchItems).where(eq(schema.punchItems.id, localId)).limit(1);

    if (!existing) {
      const seq = await nextSequenceNumber(tx, projectId, "PI");
      const [item] = await tx
        .insert(schema.punchItems)
        .values({
          id: localId,
          projectId,
          number: formatPunchItemNumber(seq),
          description: typeof data.description === "string" ? data.description : "",
          locationId: data.locationId as string | undefined,
          assigneeUserId: data.assigneeUserId as string | undefined,
          assigneeCompanyId: data.assigneeCompanyId as string | undefined,
          tradeId: data.tradeId as string | undefined,
          priority: (data.priority as "low" | "medium" | "high" | undefined) ?? "medium",
          dueDate: data.dueDate ? new Date(data.dueDate as string) : undefined,
          createdBy: userId,
        })
        .returning();
      if (!item) return { status: "rejected", reason: "insert_failed" };

      await tx.insert(schema.punchItemHistory).values({
        punchItemId: item.id,
        toStatus: "open",
        changedBy: userId,
        note: "Created offline",
      });
      await writeAuditLog(tx, { actorId: userId, entityType: "punch_item", entityId: item.id, action: "create", after: item });
      return { status: "applied", serverRevision: item.serverRevision };
    }

    if (existing.projectId !== projectId) {
      return { status: "rejected", reason: "not_found" };
    }

    const { merged, conflicts } = mergeFields(base, data, existing as unknown as Record<string, unknown>);
    if ("dueDate" in merged && typeof merged.dueDate === "string") {
      merged.dueDate = new Date(merged.dueDate);
    }

    const [updated] = await tx
      .update(schema.punchItems)
      .set({
        ...merged,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
        needsReview: conflicts.length > 0,
        conflictData: conflicts.length > 0 ? conflicts : null,
      })
      .where(eq(schema.punchItems.id, localId))
      .returning();
    if (!updated) return { status: "rejected", reason: "update_failed" };

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "punch_item",
      entityId: localId,
      action: "sync_push",
      before: existing,
      after: updated,
    });

    return {
      status: conflicts.length > 0 ? "conflict" : "applied",
      serverRevision: updated.serverRevision,
      conflicts: conflicts.length > 0 ? (conflicts as FieldConflict[]) : undefined,
    };
  });
}

export async function listPunchItemsSince(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  sinceRevision: number,
): Promise<PunchItemRow[]> {
  requirePermission(ctx, "punch_list", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx.select().from(schema.punchItems).where(eq(schema.punchItems.projectId, projectId));
    return rows.filter((r) => r.serverRevision > sinceRevision);
  });
}
