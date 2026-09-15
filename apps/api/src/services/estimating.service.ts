import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import { formatEstimateNumber, requirePermission, type CreateEstimateInput, type CreateEstimateLineItemInput, type PermissionContext } from "@siteops/shared";
import { eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type EstimateRow = typeof schema.estimates.$inferSelect;
type EstimateLineItemRow = typeof schema.estimateLineItems.$inferSelect;
type BudgetLineItemRow = typeof schema.budgetLineItems.$inferSelect;

export interface EstimateLineItemWithAmount extends EstimateLineItemRow {
  /** quantity * unitCost -- not stored, computed fresh on read (docs/DATA_MODEL.md §9 "not stored redundantly where derivable"). */
  amount: string;
}

export interface EstimateDetail extends EstimateRow {
  lineItems: EstimateLineItemWithAmount[];
  total: string;
}

function withAmount(li: EstimateLineItemRow): EstimateLineItemWithAmount {
  const amount = Number(li.quantity) * Number(li.unitCost);
  return { ...li, amount: amount.toFixed(2) };
}

export async function createEstimate(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateEstimateInput,
): Promise<EstimateRow> {
  requirePermission(ctx, "estimating", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const seq = await nextSequenceNumber(tx, input.projectId, "EST");
    const [row] = await tx
      .insert(schema.estimates)
      .values({ projectId: input.projectId, number: formatEstimateNumber(seq), title: input.title, createdBy: userId })
      .returning();
    if (!row) throw new Error("Failed to create estimate");

    await writeAuditLog(tx, { actorId: userId, entityType: "estimate", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project an estimate belongs to before loading the full permission context. */
export async function findEstimateById(appDb: Database, userId: string, estimateId: string): Promise<EstimateRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId)).limit(1);
    return row;
  });
}

export async function listEstimates(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<EstimateRow[]> {
  requirePermission(ctx, "estimating", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.estimates).where(eq(schema.estimates.projectId, projectId));
  });
}

export async function getEstimate(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  estimateId: string,
): Promise<EstimateDetail | undefined> {
  requirePermission(ctx, "estimating", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [estimate] = await tx.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId)).limit(1);
    if (!estimate) return undefined;

    const rows = await tx.select().from(schema.estimateLineItems).where(eq(schema.estimateLineItems.estimateId, estimateId));
    const lineItems = rows.map(withAmount);
    const total = lineItems.reduce((sum, li) => sum + Number(li.amount), 0);
    return { ...estimate, lineItems, total: total.toFixed(2) };
  });
}

export async function addEstimateLineItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  estimateId: string,
  input: CreateEstimateLineItemInput,
): Promise<EstimateLineItemWithAmount> {
  requirePermission(ctx, "estimating", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [estimate] = await tx.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId)).limit(1);
    if (!estimate) throw new NotFoundError("Estimate not found");
    if (estimate.status === "final") {
      throw new ApiError(400, "estimate_final", "This estimate is final and can no longer be edited");
    }

    const [row] = await tx
      .insert(schema.estimateLineItems)
      .values({
        estimateId,
        costCodeId: input.costCodeId,
        description: input.description,
        quantity: input.quantity.toString(),
        unit: input.unit,
        unitCost: input.unitCost.toString(),
      })
      .returning();
    if (!row) throw new Error("Failed to add estimate line item");
    return withAmount(row);
  });
}

export async function finalizeEstimate(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  estimateId: string,
): Promise<EstimateRow> {
  requirePermission(ctx, "estimating", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId)).limit(1);
    if (!existing) throw new NotFoundError("Estimate not found");
    if (existing.status === "final") {
      throw new ApiError(409, "invalid_status_transition", "This estimate is already final");
    }

    const [updated] = await tx
      .update(schema.estimates)
      .set({ status: "final", updatedBy: userId, updatedAt: new Date(), serverRevision: existing.serverRevision + 1 })
      .where(eq(schema.estimates.id, estimateId))
      .returning();
    if (!updated) throw new Error("Failed to finalize estimate");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "estimate",
      entityId: estimateId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: "final" },
    });
    return updated;
  });
}

/**
 * Pushes a final estimate into the Budget: one new budget_line_items row per
 * distinct cost code, its originalAmount the sum of that code's estimate
 * line items -- Procore's own Estimating -> Budget handoff. Guarded by
 * convertedToBudgetAt so a second click can't silently duplicate the lines.
 */
export async function convertEstimateToBudget(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  estimateId: string,
): Promise<BudgetLineItemRow[]> {
  requirePermission(ctx, "estimating", "admin");
  requirePermission(ctx, "budget", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [estimate] = await tx.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId)).limit(1);
    if (!estimate) throw new NotFoundError("Estimate not found");
    if (estimate.status !== "final") {
      throw new ApiError(400, "estimate_not_final", "Only a final estimate can be converted to a budget");
    }
    if (estimate.convertedToBudgetAt) {
      throw new ApiError(409, "already_converted", "This estimate has already been converted to a budget");
    }

    const lineItems = await tx.select().from(schema.estimateLineItems).where(eq(schema.estimateLineItems.estimateId, estimateId));
    const totalsByCostCode = new Map<string, number>();
    for (const li of lineItems) {
      const amount = Number(li.quantity) * Number(li.unitCost);
      totalsByCostCode.set(li.costCodeId, (totalsByCostCode.get(li.costCodeId) ?? 0) + amount);
    }

    const created: BudgetLineItemRow[] = [];
    for (const [costCodeId, originalAmount] of totalsByCostCode) {
      const [row] = await tx
        .insert(schema.budgetLineItems)
        .values({
          projectId: estimate.projectId,
          costCodeId,
          originalAmount: originalAmount.toFixed(2),
          projectedAmount: originalAmount.toFixed(2),
          createdBy: userId,
        })
        .returning();
      if (!row) throw new Error("Failed to create budget line item from estimate");
      created.push(row);
    }

    await tx
      .update(schema.estimates)
      .set({ convertedToBudgetAt: new Date(), updatedBy: userId, updatedAt: new Date(), serverRevision: estimate.serverRevision + 1 })
      .where(eq(schema.estimates.id, estimateId));

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "estimate",
      entityId: estimateId,
      action: "convert_to_budget",
      after: { budgetLineItemIds: created.map((r) => r.id) },
    });
    return created;
  });
}
