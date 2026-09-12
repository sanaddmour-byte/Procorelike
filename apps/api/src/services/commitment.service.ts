import { nextSequenceNumber, schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  formatCommitmentNumber,
  requirePermission,
  type CreateCommitmentInput,
  type CreateCommitmentLineItemInput,
  type PermissionContext,
} from "@siteops/shared";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type CommitmentRow = typeof schema.commitments.$inferSelect;
type CommitmentLineItemRow = typeof schema.commitmentLineItems.$inferSelect;
type ChangeOrderRow = typeof schema.changeOrders.$inferSelect;

export interface CommitmentDetail extends CommitmentRow {
  lineItems: CommitmentLineItemRow[];
  /** Sum of SOV line items plus any approved change orders targeting this commitment -- the contract value is derived, not stored (docs/DATA_MODEL.md §9 "not stored redundantly where derivable"). */
  contractValue: number;
}

export async function createCommitment(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateCommitmentInput,
): Promise<CommitmentRow> {
  requirePermission(ctx, "commitments", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const seq = await nextSequenceNumber(tx, input.projectId, input.type === "po" ? "PO" : "SC");
    const [row] = await tx
      .insert(schema.commitments)
      .values({
        projectId: input.projectId,
        number: formatCommitmentNumber(input.type, seq),
        title: input.title,
        companyId: input.companyId,
        type: input.type,
        costCodeId: input.costCodeId,
        retentionPct: input.retentionPct.toString(),
        currency: input.currency,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create commitment");

    await writeAuditLog(tx, { actorId: userId, entityType: "commitment", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project a commitment belongs to before loading the full permission context. */
export async function findCommitmentById(appDb: Database, userId: string, commitmentId: string): Promise<CommitmentRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.commitments).where(eq(schema.commitments.id, commitmentId)).limit(1);
    return row;
  });
}

export async function listCommitments(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<CommitmentRow[]> {
  requirePermission(ctx, "commitments", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.commitments).where(eq(schema.commitments.projectId, projectId));
  });
}

async function computeContractValue(tx: Tx, commitmentId: string, lineItems: CommitmentLineItemRow[]): Promise<number> {
  const approvedChangeOrders: ChangeOrderRow[] = await tx
    .select()
    .from(schema.changeOrders)
    .where(eq(schema.changeOrders.targetId, commitmentId));

  const sovTotal = lineItems.reduce((sum, li) => sum + Number(li.scheduleOfValuesAmount), 0);
  const approvedChangesTotal = approvedChangeOrders
    .filter((co) => co.targetType === "commitment" && co.status === "approved")
    .reduce((sum, co) => sum + Number(co.costImpact), 0);
  return sovTotal + approvedChangesTotal;
}

export async function getCommitment(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  commitmentId: string,
): Promise<CommitmentDetail | undefined> {
  requirePermission(ctx, "commitments", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [commitment] = await tx.select().from(schema.commitments).where(eq(schema.commitments.id, commitmentId)).limit(1);
    if (!commitment) return undefined;

    const lineItems = await tx
      .select()
      .from(schema.commitmentLineItems)
      .where(eq(schema.commitmentLineItems.commitmentId, commitmentId));

    const contractValue = await computeContractValue(tx, commitmentId, lineItems);
    return { ...commitment, lineItems, contractValue };
  });
}

export async function addCommitmentLineItem(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  commitmentId: string,
  input: CreateCommitmentLineItemInput,
): Promise<CommitmentLineItemRow> {
  requirePermission(ctx, "commitments", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [commitment] = await tx.select().from(schema.commitments).where(eq(schema.commitments.id, commitmentId)).limit(1);
    if (!commitment) throw new NotFoundError("Commitment not found");

    const [row] = await tx
      .insert(schema.commitmentLineItems)
      .values({
        commitmentId,
        costCodeId: input.costCodeId,
        description: input.description,
        scheduleOfValuesAmount: input.scheduleOfValuesAmount.toString(),
      })
      .returning();
    if (!row) throw new Error("Failed to create commitment line item");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "commitment_line_item",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });
}
