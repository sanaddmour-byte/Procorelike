import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  CORRECTIVE_ACTION_STATUS_TRANSITIONS,
  requirePermission,
  type CreateCorrectiveActionInput,
  type PermissionContext,
  type TransitionCorrectiveActionStatusInput,
} from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type CorrectiveActionRow = typeof schema.correctiveActions.$inferSelect;

/**
 * Procore's Corrective Actions: a trackable, assignable, due-dated action
 * item spawned from a safety incident, a safety observation, or a failed
 * inspection item -- gated uniformly on the "safety" module regardless of
 * source, since Procore's own Corrective Actions tool sits under Quality &
 * Safety and applies to all three sources alike.
 */
export async function createCorrectiveAction(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateCorrectiveActionInput,
): Promise<CorrectiveActionRow> {
  requirePermission(ctx, "safety", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.correctiveActions)
      .values({ ...input, dueDate: new Date(input.dueDate), createdBy: userId })
      .returning();
    if (!row) throw new Error("Failed to create corrective action");

    await writeAuditLog(tx, { actorId: userId, entityType: "corrective_action", entityId: row.id, action: "create", after: row });
    return row;
  });
}

export async function findCorrectiveActionById(
  appDb: Database,
  userId: string,
  actionId: string,
): Promise<CorrectiveActionRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.correctiveActions).where(eq(schema.correctiveActions.id, actionId)).limit(1);
    return row;
  });
}

export async function listCorrectiveActions(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  sourceFilter?: { sourceType: string; sourceId: string },
): Promise<CorrectiveActionRow[]> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.correctiveActions.projectId, projectId)];
    if (sourceFilter) {
      conditions.push(
        eq(schema.correctiveActions.sourceType, sourceFilter.sourceType as (typeof schema.correctiveActions.$inferSelect)["sourceType"]),
        eq(schema.correctiveActions.sourceId, sourceFilter.sourceId),
      );
    }
    return tx
      .select()
      .from(schema.correctiveActions)
      .where(and(...conditions));
  });
}

export async function transitionCorrectiveActionStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  actionId: string,
  input: TransitionCorrectiveActionStatusInput,
): Promise<CorrectiveActionRow> {
  requirePermission(ctx, "safety", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.correctiveActions).where(eq(schema.correctiveActions.id, actionId)).limit(1);
    if (!existing) throw new NotFoundError("Corrective action not found");

    const allowed = CORRECTIVE_ACTION_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(
        409,
        "invalid_status_transition",
        `Cannot move a corrective action from '${existing.status}' to '${input.toStatus}'`,
      );
    }

    const [updated] = await tx
      .update(schema.correctiveActions)
      .set({
        status: input.toStatus,
        completedBy: input.toStatus === "completed" ? userId : input.toStatus === "open" ? null : existing.completedBy,
        completedAt: input.toStatus === "completed" ? new Date() : input.toStatus === "open" ? null : existing.completedAt,
        verifiedBy: input.toStatus === "verified" ? userId : input.toStatus === "open" ? null : existing.verifiedBy,
        verifiedAt: input.toStatus === "verified" ? new Date() : input.toStatus === "open" ? null : existing.verifiedAt,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(schema.correctiveActions.id, actionId))
      .returning();
    if (!updated) throw new Error("Failed to transition corrective action");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "corrective_action",
      entityId: actionId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
