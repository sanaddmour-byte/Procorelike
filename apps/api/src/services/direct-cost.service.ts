import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type CreateDirectCostInput, type PermissionContext } from "@siteops/shared";
import { eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type DirectCostRow = typeof schema.directCosts.$inferSelect;

/**
 * Procore's Direct Costs: a cost that hits a budget cost code without going
 * through a commitment (subcontract/PO) -- a permit fee, owner-purchased
 * material, payroll allocation, etc. Only "approved" rows feed the Budget
 * grid's directCosts rollup (budget.service.ts's attachRollups), mirroring
 * how a pending change order doesn't count as committed until approved.
 */
export async function createDirectCost(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateDirectCostInput,
): Promise<DirectCostRow> {
  requirePermission(ctx, "direct_costs", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.directCosts)
      .values({
        projectId: input.projectId,
        costCodeId: input.costCodeId,
        vendorCompanyId: input.vendorCompanyId,
        type: input.type,
        description: input.description,
        amount: input.amount.toString(),
        incurredDate: new Date(input.incurredDate),
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create direct cost");

    await writeAuditLog(tx, { actorId: userId, entityType: "direct_cost", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project a direct cost belongs to before loading the full permission context. */
export async function findDirectCostById(appDb: Database, userId: string, directCostId: string): Promise<DirectCostRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.directCosts).where(eq(schema.directCosts.id, directCostId)).limit(1);
    return row;
  });
}

export async function listDirectCosts(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<DirectCostRow[]> {
  requirePermission(ctx, "direct_costs", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.directCosts).where(eq(schema.directCosts.projectId, projectId));
  });
}

export async function transitionDirectCostStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  directCostId: string,
  toStatus: "approved" | "rejected",
): Promise<DirectCostRow> {
  requirePermission(ctx, "direct_costs", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.directCosts).where(eq(schema.directCosts.id, directCostId)).limit(1);
    if (!existing) throw new NotFoundError("Direct cost not found");
    if (existing.status !== "pending") {
      throw new ApiError(409, "invalid_status_transition", `Cannot transition a direct cost that is already '${existing.status}'`);
    }

    const [updated] = await tx
      .update(schema.directCosts)
      .set({
        status: toStatus,
        approvedBy: userId,
        approvedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.directCosts.id, directCostId))
      .returning();
    if (!updated) throw new Error("Failed to transition direct cost");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "direct_cost",
      entityId: directCostId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
