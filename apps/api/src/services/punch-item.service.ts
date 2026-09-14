import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  canEditOwnedRecord,
  formatPunchItemNumber,
  hasPermission,
  mergeFields,
  PermissionDeniedError,
  PUNCH_ITEM_STATUS_TRANSITIONS,
  requirePermission,
  type CreatePunchItemInput,
  type FieldConflict,
  type PermissionContext,
  type TransitionPunchItemStatusInput,
  type UpdatePunchItemInput,
} from "@siteops/shared";
import { eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import type { SyncApplyResult } from "./daily-log.service";

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

export async function listPunchItems(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<PunchItemRow[]> {
  requirePermission(ctx, "punch_list", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.punchItems).where(eq(schema.punchItems.projectId, projectId));
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
    return updated;
  });
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
