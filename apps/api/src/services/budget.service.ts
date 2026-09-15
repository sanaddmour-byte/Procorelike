import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  computeProjectedAmount,
  requirePermission,
  type CreateBudgetLineItemInput,
  type CreateBudgetModificationInput,
  type PermissionContext,
  type UpdateBudgetLineItemInput,
} from "@siteops/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

type BudgetLineItemRow = typeof schema.budgetLineItems.$inferSelect;
type BudgetModificationRow = typeof schema.budgetModifications.$inferSelect;

/**
 * Procore's Detailed Budget view surfaces Committed Costs (from approved
 * commitments against the same cost code) and Pending Cost Changes (change
 * orders targeting this line item that haven't been approved yet) alongside
 * the stored budget figures. Neither is stored -- both are cheap aggregates
 * computed fresh on every read, same as rfi.service.ts's isOverdue pattern,
 * so they can never drift from the underlying commitments/change orders.
 */
export interface BudgetLineItemWithRollups extends BudgetLineItemRow {
  committedCosts: string;
  pendingCostChanges: string;
  directCosts: string;
}

export async function attachRollups(tx: Tx, projectId: string, lineItems: BudgetLineItemRow[]): Promise<BudgetLineItemWithRollups[]> {
  if (lineItems.length === 0) return [];
  const lineItemIds = lineItems.map((li) => li.id);
  const costCodeIds = [...new Set(lineItems.map((li) => li.costCodeId))];

  const [committedRows, pendingRows, directCostRows] = await Promise.all([
    tx
      .select({
        costCodeId: schema.commitments.costCodeId,
        total: sql<string>`coalesce(sum(${schema.commitmentLineItems.scheduleOfValuesAmount}), 0)`,
      })
      .from(schema.commitmentLineItems)
      .innerJoin(schema.commitments, eq(schema.commitments.id, schema.commitmentLineItems.commitmentId))
      .where(and(eq(schema.commitments.projectId, projectId), inArray(schema.commitments.costCodeId, costCodeIds)))
      .groupBy(schema.commitments.costCodeId),
    tx
      .select({
        targetId: schema.changeOrders.targetId,
        total: sql<string>`coalesce(sum(${schema.changeOrders.costImpact}), 0)`,
      })
      .from(schema.changeOrders)
      .where(
        and(
          eq(schema.changeOrders.projectId, projectId),
          eq(schema.changeOrders.targetType, "prime"),
          eq(schema.changeOrders.status, "pending_approval"),
          inArray(schema.changeOrders.targetId, lineItemIds),
        ),
      )
      .groupBy(schema.changeOrders.targetId),
    // Only approved direct costs count -- mirrors committedCosts only
    // counting costs that have actually cleared, not merely proposed ones.
    tx
      .select({
        costCodeId: schema.directCosts.costCodeId,
        total: sql<string>`coalesce(sum(${schema.directCosts.amount}), 0)`,
      })
      .from(schema.directCosts)
      .where(
        and(
          eq(schema.directCosts.projectId, projectId),
          eq(schema.directCosts.status, "approved"),
          inArray(schema.directCosts.costCodeId, costCodeIds),
        ),
      )
      .groupBy(schema.directCosts.costCodeId),
  ]);

  const committedByCostCode = new Map(committedRows.filter((r) => r.costCodeId !== null).map((r) => [r.costCodeId as string, r.total]));
  const pendingByLineItem = new Map(pendingRows.map((r) => [r.targetId, r.total]));
  const directCostsByCostCode = new Map(directCostRows.map((r) => [r.costCodeId, r.total]));

  return lineItems.map((li) => ({
    ...li,
    committedCosts: committedByCostCode.get(li.costCodeId) ?? "0",
    pendingCostChanges: pendingByLineItem.get(li.id) ?? "0",
    directCosts: directCostsByCostCode.get(li.costCodeId) ?? "0",
  }));
}

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
    const projectedAmount = computeProjectedAmount(originalAmount, 0, 0, forecastToComplete);

    const [row] = await tx
      .insert(schema.budgetLineItems)
      .values({
        projectId: input.projectId,
        costCodeId: input.costCodeId,
        originalAmount: originalAmount.toString(),
        modificationsAmount: "0",
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
): Promise<BudgetLineItemWithRollups[]> {
  requirePermission(ctx, "budget", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.projectId, projectId));
    return attachRollups(tx, projectId, rows);
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
    const modificationsAmount = Number(existing.modificationsAmount);
    const approvedChangesAmount = Number(existing.approvedChangesAmount);
    const projectedAmount = computeProjectedAmount(originalAmount, modificationsAmount, approvedChangesAmount, forecastToComplete);

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

/** Recomputes and persists a line item's projectedAmount from its current stored fields -- shared by both sides of a budget modification. */
async function recomputeProjectedAmount(tx: Tx, lineItem: BudgetLineItemRow, userId: string): Promise<BudgetLineItemRow> {
  const projectedAmount = computeProjectedAmount(
    Number(lineItem.originalAmount),
    Number(lineItem.modificationsAmount),
    Number(lineItem.approvedChangesAmount),
    Number(lineItem.forecastToComplete),
  );
  const [updated] = await tx
    .update(schema.budgetLineItems)
    .set({ projectedAmount: projectedAmount.toString(), updatedBy: userId, updatedAt: new Date(), serverRevision: lineItem.serverRevision + 1 })
    .where(eq(schema.budgetLineItems.id, lineItem.id))
    .returning();
  if (!updated) throw new Error("Failed to recompute budget line item");
  return updated;
}

/**
 * Procore's Budget Modification: moves `amount` from one line item to
 * another, decrementing the "from" line's modificationsAmount and
 * incrementing the "to" line's by the same amount in one transaction so the
 * project's total budget never drifts -- unlike an approved change order,
 * which does change the overall contract value.
 */
export async function createBudgetModification(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateBudgetModificationInput,
): Promise<BudgetModificationRow> {
  requirePermission(ctx, "budget", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [fromLine, toLine] = await Promise.all([
      tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.id, input.fromLineItemId)).limit(1).then((r) => r[0]),
      tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.id, input.toLineItemId)).limit(1).then((r) => r[0]),
    ]);
    if (!fromLine || fromLine.projectId !== input.projectId) throw new ApiError(400, "validation_error", "fromLineItemId must be an existing line item on this project");
    if (!toLine || toLine.projectId !== input.projectId) throw new ApiError(400, "validation_error", "toLineItemId must be an existing line item on this project");

    const [modification] = await tx
      .insert(schema.budgetModifications)
      .values({
        projectId: input.projectId,
        fromLineItemId: input.fromLineItemId,
        toLineItemId: input.toLineItemId,
        amount: input.amount.toString(),
        reason: input.reason,
        createdBy: userId,
      })
      .returning();
    if (!modification) throw new Error("Failed to create budget modification");

    const [fromUpdated] = await tx
      .update(schema.budgetLineItems)
      .set({ modificationsAmount: (Number(fromLine.modificationsAmount) - input.amount).toString() })
      .where(eq(schema.budgetLineItems.id, fromLine.id))
      .returning();
    const [toUpdated] = await tx
      .update(schema.budgetLineItems)
      .set({ modificationsAmount: (Number(toLine.modificationsAmount) + input.amount).toString() })
      .where(eq(schema.budgetLineItems.id, toLine.id))
      .returning();
    if (!fromUpdated || !toUpdated) throw new Error("Failed to apply budget modification");

    await recomputeProjectedAmount(tx, fromUpdated, userId);
    await recomputeProjectedAmount(tx, toUpdated, userId);

    await writeAuditLog(tx, { actorId: userId, entityType: "budget_modification", entityId: modification.id, action: "create", after: modification });
    return modification;
  });
}

export async function listBudgetModifications(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<BudgetModificationRow[]> {
  requirePermission(ctx, "budget", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.budgetModifications).where(eq(schema.budgetModifications.projectId, projectId));
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
  const modificationsAmount = Number(existing.modificationsAmount);
  const forecastToComplete = Number(existing.forecastToComplete);
  const projectedAmount = computeProjectedAmount(originalAmount, modificationsAmount, approvedChangesAmount, forecastToComplete);

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
