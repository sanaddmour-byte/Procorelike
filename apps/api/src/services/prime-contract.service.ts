import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  computeRevisedBudget,
  PRIME_CONTRACT_STATUS_TRANSITIONS,
  requirePermission,
  type CreatePrimeContractInput,
  type PermissionContext,
  type UpdatePrimeContractInput,
} from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type PrimeContractRow = typeof schema.primeContracts.$inferSelect;

/**
 * Procore's Prime Contract: the owner agreement itself, one per project.
 * Approved/pending changes are computed fresh from the *same*
 * "prime"-targeted change_orders already used by the Budget grid
 * (budget.service.ts's attachRollups), summed project-wide rather than
 * per-line-item -- deliberately not re-plumbed to target primeContracts.id
 * directly, so the already-tested change-management workflow is untouched.
 * "Invoiced to date" is intentionally not modeled: payment_application_lines
 * always references a commitment's own SOV line items, even for a
 * commitmentId=null (prime) application, so there's no independent SOV to
 * bill against yet -- documented here rather than papered over.
 */
export interface PrimeContractWithRollups extends PrimeContractRow {
  approvedChangesAmount: string;
  pendingChangesAmount: string;
  revisedContractSum: string;
}

async function attachRollups(tx: Tx, contract: PrimeContractRow): Promise<PrimeContractWithRollups> {
  const changeOrders = await tx
    .select({ costImpact: schema.changeOrders.costImpact, status: schema.changeOrders.status })
    .from(schema.changeOrders)
    .where(and(eq(schema.changeOrders.projectId, contract.projectId), eq(schema.changeOrders.targetType, "prime")));

  const approvedChangesAmount = changeOrders
    .filter((co) => co.status === "approved")
    .reduce((sum, co) => sum + Number(co.costImpact), 0);
  const pendingChangesAmount = changeOrders
    .filter((co) => co.status === "pending_approval")
    .reduce((sum, co) => sum + Number(co.costImpact), 0);
  const revisedContractSum = computeRevisedBudget(Number(contract.originalContractSum), 0, approvedChangesAmount);

  return {
    ...contract,
    approvedChangesAmount: approvedChangesAmount.toString(),
    pendingChangesAmount: pendingChangesAmount.toString(),
    revisedContractSum: revisedContractSum.toString(),
  };
}

export async function createPrimeContract(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreatePrimeContractInput,
): Promise<PrimeContractRow> {
  requirePermission(ctx, "prime_contract", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    try {
      const [row] = await tx
        .insert(schema.primeContracts)
        .values({
          projectId: input.projectId,
          contractNumber: input.contractNumber,
          title: input.title,
          ownerCompanyId: input.ownerCompanyId,
          originalContractSum: input.originalContractSum.toString(),
          retentionPct: input.retentionPct.toString(),
          currency: input.currency,
          createdBy: userId,
        })
        .returning();
      if (!row) throw new Error("Failed to create prime contract");

      await writeAuditLog(tx, { actorId: userId, entityType: "prime_contract", entityId: row.id, action: "create", after: row });
      return row;
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        throw new ApiError(409, "prime_contract_exists", "A prime contract already exists for this project");
      }
      throw err;
    }
  });
}

/** Peek used by routes to resolve which project a prime contract belongs to before loading the full permission context. */
export async function findPrimeContractById(appDb: Database, userId: string, contractId: string): Promise<PrimeContractRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.primeContracts).where(eq(schema.primeContracts.id, contractId)).limit(1);
    return row;
  });
}

export async function getPrimeContractByProject(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<PrimeContractWithRollups | undefined> {
  requirePermission(ctx, "prime_contract", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.select().from(schema.primeContracts).where(eq(schema.primeContracts.projectId, projectId)).limit(1);
    if (!row) return undefined;
    return attachRollups(tx, row);
  });
}

export async function updatePrimeContract(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  contractId: string,
  input: UpdatePrimeContractInput,
): Promise<PrimeContractRow> {
  requirePermission(ctx, "prime_contract", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.primeContracts).where(eq(schema.primeContracts.id, contractId)).limit(1);
    if (!existing) throw new NotFoundError("Prime contract not found");

    const [updated] = await tx
      .update(schema.primeContracts)
      .set({
        contractNumber: input.contractNumber ?? existing.contractNumber,
        title: input.title ?? existing.title,
        originalContractSum: input.originalContractSum !== undefined ? input.originalContractSum.toString() : existing.originalContractSum,
        retentionPct: input.retentionPct !== undefined ? input.retentionPct.toString() : existing.retentionPct,
        executedDate: input.executedDate ? new Date(input.executedDate) : existing.executedDate,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.primeContracts.id, contractId))
      .returning();
    if (!updated) throw new Error("Failed to update prime contract");
    return updated;
  });
}

export async function transitionPrimeContractStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  contractId: string,
  toStatus: PrimeContractRow["status"],
): Promise<PrimeContractRow> {
  requirePermission(ctx, "prime_contract", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.primeContracts).where(eq(schema.primeContracts.id, contractId)).limit(1);
    if (!existing) throw new NotFoundError("Prime contract not found");

    const allowed = PRIME_CONTRACT_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(toStatus)) {
      throw new ApiError(409, "invalid_status_transition", `Cannot move a prime contract from '${existing.status}' to '${toStatus}'`);
    }

    const [updated] = await tx
      .update(schema.primeContracts)
      .set({
        status: toStatus,
        executedDate: toStatus === "executed" && !existing.executedDate ? new Date() : existing.executedDate,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.primeContracts.id, contractId))
      .returning();
    if (!updated) throw new Error("Failed to transition prime contract");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "prime_contract",
      entityId: contractId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
