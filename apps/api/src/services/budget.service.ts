import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  computeProjectedAmount,
  requirePermission,
  type CreateBudgetLineItemInput,
  type PermissionContext,
  type UpdateBudgetLineItemInput,
} from "@siteops/shared";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

type BudgetLineItemRow = typeof schema.budgetLineItems.$inferSelect;

export async function createBudgetLineItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateBudgetLineItemInput,
): Promise<BudgetLineItemRow> {
  requirePermission(ctx, "budget", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const originalAmount = input.originalAmount;
    const forecastToComplete = input.forecastToComplete;
    const projectedAmount = computeProjectedAmount(originalAmount, 0, forecastToComplete);

    const [row] = await tx
      .insert(schema.budgetLineItems)
      .values({
        projectId: input.projectId,
        costCodeId: input.costCodeId,
        originalAmount: originalAmount.toString(),
        approvedChangesAmount: "0",
        forecastToComplete: forecastToComplete.toString(),
        projectedAmount: projectedAmount.toString(),
        currency: input.currency,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create budget line item");

    await writeAuditLog(tx, { actorId: userId, entityType: "budget_line_item", entityId: row.id, action: "create", after: row });
    return row;
  });
}

export async function listBudgetLineItems(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<BudgetLineItemRow[]> {
  requirePermission(ctx, "budget", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.projectId, projectId));
  });
}

export async function updateBudgetLineItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  lineItemId: string,
  input: UpdateBudgetLineItemInput,
): Promise<BudgetLineItemRow> {
  requirePermission(ctx, "budget", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.id, lineItemId)).limit(1);
    if (!existing) throw new NotFoundError("Budget line item not found");

    const originalAmount = input.originalAmount ?? Number(existing.originalAmount);
    const forecastToComplete = input.forecastToComplete ?? Number(existing.forecastToComplete);
    const approvedChangesAmount = Number(existing.approvedChangesAmount);
    const projectedAmount = computeProjectedAmount(originalAmount, approvedChangesAmount, forecastToComplete);

    const [updated] = await tx
      .update(schema.budgetLineItems)
      .set({
        originalAmount: originalAmount.toString(),
        forecastToComplete: forecastToComplete.toString(),
        projectedAmount: projectedAmount.toString(),
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.budgetLineItems.id, lineItemId))
      .returning();
    if (!updated) throw new Error("Failed to update budget line item");
    return updated;
  });
}

/** Called by change-management.service.ts when a 'prime'-targeted change order is approved. Bumps approvedChangesAmount and recomputes projectedAmount in the same transaction as the approval, so the two can't drift apart. */
export async function applyApprovedPrimeChangeToLineItem(
  tx: Tx,
  lineItemId: string,
  costImpact: number,
  actorId: string,
): Promise<BudgetLineItemRow> {
  const [existing] = await tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.id, lineItemId)).limit(1);
  if (!existing) throw new NotFoundError("Budget line item not found");

  const approvedChangesAmount = Number(existing.approvedChangesAmount) + costImpact;
  const originalAmount = Number(existing.originalAmount);
  const forecastToComplete = Number(existing.forecastToComplete);
  const projectedAmount = computeProjectedAmount(originalAmount, approvedChangesAmount, forecastToComplete);

  const [updated] = await tx
    .update(schema.budgetLineItems)
    .set({
      approvedChangesAmount: approvedChangesAmount.toString(),
      projectedAmount: projectedAmount.toString(),
      updatedBy: actorId,
      updatedAt: new Date(),
      serverRevision: existing.serverRevision + 1,
    })
    .where(eq(schema.budgetLineItems.id, lineItemId))
    .returning();
  if (!updated) throw new Error("Failed to apply change order to budget line item");
  return updated;
}
