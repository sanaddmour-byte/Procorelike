import { nextSequenceNumber, schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  DEFAULT_PAGE_SIZE,
  formatCommitmentNumber,
  requirePermission,
  type CommitmentSortKey,
  type CreateCommitmentInput,
  type CreateCommitmentLineItemInput,
  type ListCommitmentsQuery,
  type PaginatedResult,
  type PermissionContext,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
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

const COMMITMENT_SORT_COLUMNS: Record<
  CommitmentSortKey,
  typeof schema.commitments.number | typeof schema.commitments.title | typeof schema.commitments.type
> = {
  number: schema.commitments.number,
  title: schema.commitments.title,
  type: schema.commitments.type,
};

export async function listCommitments(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListCommitmentsQuery = {},
): Promise<PaginatedResult<CommitmentRow>> {
  requirePermission(ctx, "commitments", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.commitments.projectId, projectId)];

    if (query.type) conditions.push(eq(schema.commitments.type, query.type));
    if (query.companyId) conditions.push(eq(schema.commitments.companyId, query.companyId));
    if (query.search) {
      conditions.push(or(ilike(schema.commitments.title, `%${query.search}%`), ilike(schema.commitments.number, `%${query.search}%`))!);
    }
    const where = and(...conditions)!;

    const sortColumn = COMMITMENT_SORT_COLUMNS[query.sort ?? "number"];
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.commitments).where(where).orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.commitments).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
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
