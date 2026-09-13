import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  CORRESPONDENCE_STATUS_TRANSITIONS,
  formatCorrespondenceNumber,
  requirePermission,
  type CreateCorrespondenceInput,
  type PermissionContext,
  type TransitionCorrespondenceStatusInput,
} from "@siteops/shared";
import { eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type CorrespondenceRow = typeof schema.correspondence.$inferSelect;

export async function createCorrespondence(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateCorrespondenceInput,
): Promise<CorrespondenceRow> {
  requirePermission(ctx, "correspondence", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const seq = await nextSequenceNumber(tx, input.projectId, "COR");
    const [row] = await tx
      .insert(schema.correspondence)
      .values({
        projectId: input.projectId,
        correspondenceNumber: formatCorrespondenceNumber(seq),
        direction: input.direction,
        type: input.type,
        subject: input.subject,
        body: input.body,
        fromCompanyId: input.fromCompanyId,
        toCompanyId: input.toCompanyId,
        responseRequiredBy: input.responseRequiredBy ? new Date(input.responseRequiredBy) : undefined,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create correspondence");

    await writeAuditLog(tx, { actorId: userId, entityType: "correspondence", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project a correspondence item belongs to before loading the full permission context. */
export async function findCorrespondenceById(
  appDb: Database,
  userId: string,
  correspondenceId: string,
): Promise<CorrespondenceRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.correspondence).where(eq(schema.correspondence.id, correspondenceId)).limit(1);
    return row;
  });
}

export async function listCorrespondence(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<CorrespondenceRow[]> {
  requirePermission(ctx, "correspondence", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.correspondence).where(eq(schema.correspondence.projectId, projectId));
  });
}

export async function transitionCorrespondenceStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  correspondenceId: string,
  input: TransitionCorrespondenceStatusInput,
): Promise<CorrespondenceRow> {
  requirePermission(ctx, "correspondence", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.correspondence).where(eq(schema.correspondence.id, correspondenceId)).limit(1);
    if (!existing) throw new NotFoundError("Correspondence not found");

    const allowed = CORRESPONDENCE_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(
        409,
        "invalid_status_transition",
        `Cannot move correspondence from '${existing.status}' to '${input.toStatus}'`,
      );
    }

    const [updated] = await tx
      .update(schema.correspondence)
      .set({
        status: input.toStatus,
        sentDate: input.toStatus === "sent" ? new Date() : existing.sentDate,
        acknowledgedBy: input.toStatus === "acknowledged" ? userId : existing.acknowledgedBy,
        acknowledgedAt: input.toStatus === "acknowledged" ? new Date() : existing.acknowledgedAt,
        closedBy: input.toStatus === "closed" ? userId : existing.closedBy,
        closedAt: input.toStatus === "closed" ? new Date() : existing.closedAt,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(schema.correspondence.id, correspondenceId))
      .returning();
    if (!updated) throw new Error("Failed to transition correspondence");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "correspondence",
      entityId: correspondenceId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
