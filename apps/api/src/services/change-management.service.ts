import { nextSequenceNumber, schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  CHANGE_EVENT_STATUS_TRANSITIONS,
  formatChangeOrderNumber,
  isValidSecondApprover,
  requiresSecondApprover,
  requirePermission,
  type Approver,
  type ChangeOrderTargetType,
  type ChangeReason,
  type ChangeStatus,
  type CreateChangeEventInput,
  type CreateChangeOrderInput,
  type CreatePotentialChangeOrderInput,
  type PermissionContext,
  type TransitionChangeEventStatusInput,
  type UpdatePotentialChangeOrderStatusInput,
} from "@siteops/shared";
import { and, eq, inArray } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { resolveAuthorCompanyBranding, type ReportBranding } from "../lib/report-branding";
import { applyApprovedPrimeChangeToLineItem } from "./budget.service";
import { withUserContext } from "./permission.service";

type ChangeEventRow = typeof schema.changeEvents.$inferSelect;
type PotentialChangeOrderRow = typeof schema.potentialChangeOrders.$inferSelect;
type ChangeOrderRow = typeof schema.changeOrders.$inferSelect;

export interface ChangeEventDetail extends ChangeEventRow {
  potentialChangeOrders: PotentialChangeOrderRow[];
}

export async function createChangeEvent(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateChangeEventInput,
): Promise<ChangeEventRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.changeEvents)
      .values({
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        potentialCostImpact: input.potentialCostImpact?.toString(),
        reason: input.reason,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create change event");

    await writeAuditLog(tx, { actorId: userId, entityType: "change_event", entityId: row.id, action: "create", after: row });
    return row;
  });
}

export async function transitionChangeEventStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeEventId: string,
  input: TransitionChangeEventStatusInput,
): Promise<ChangeEventRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.changeEvents).where(eq(schema.changeEvents.id, changeEventId)).limit(1);
    if (!existing) throw new NotFoundError("Change event not found");

    const allowed = CHANGE_EVENT_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(409, "invalid_status_transition", `Cannot move a change event from '${existing.status}' to '${input.toStatus}'`);
    }

    const [updated] = await tx
      .update(schema.changeEvents)
      .set({ status: input.toStatus })
      .where(eq(schema.changeEvents.id, changeEventId))
      .returning();
    if (!updated) throw new Error("Failed to transition change event");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "change_event",
      entityId: changeEventId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

/** Peek used by routes to resolve which project a change event belongs to before loading the full permission context. */
export async function findChangeEventById(appDb: Database, userId: string, changeEventId: string): Promise<ChangeEventRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.changeEvents).where(eq(schema.changeEvents.id, changeEventId)).limit(1);
    return row;
  });
}

export async function listChangeEvents(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ChangeEventRow[]> {
  requirePermission(ctx, "change_management", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.changeEvents).where(eq(schema.changeEvents.projectId, projectId));
  });
}

export async function getChangeEvent(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeEventId: string,
): Promise<ChangeEventDetail | undefined> {
  requirePermission(ctx, "change_management", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [event] = await tx.select().from(schema.changeEvents).where(eq(schema.changeEvents.id, changeEventId)).limit(1);
    if (!event) return undefined;
    const pcos = await tx
      .select()
      .from(schema.potentialChangeOrders)
      .where(eq(schema.potentialChangeOrders.changeEventId, changeEventId));
    return { ...event, potentialChangeOrders: pcos };
  });
}

export async function createPotentialChangeOrder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeEventId: string,
  input: CreatePotentialChangeOrderInput,
): Promise<PotentialChangeOrderRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [event] = await tx.select().from(schema.changeEvents).where(eq(schema.changeEvents.id, changeEventId)).limit(1);
    if (!event) throw new NotFoundError("Change event not found");

    const [row] = await tx
      .insert(schema.potentialChangeOrders)
      .values({
        changeEventId,
        costImpact: input.costImpact?.toString(),
        timeImpactDays: input.timeImpactDays,
      })
      .returning();
    if (!row) throw new Error("Failed to create potential change order");
    return row;
  });
}

/** Peek used by routes to resolve which project a PCO belongs to before loading the full permission context. */
export async function findPotentialChangeOrderById(
  appDb: Database,
  userId: string,
  pcoId: string,
): Promise<(PotentialChangeOrderRow & { projectId: string }) | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx
      .select({ pco: schema.potentialChangeOrders, projectId: schema.changeEvents.projectId })
      .from(schema.potentialChangeOrders)
      .innerJoin(schema.changeEvents, eq(schema.potentialChangeOrders.changeEventId, schema.changeEvents.id))
      .where(eq(schema.potentialChangeOrders.id, pcoId))
      .limit(1);
    return row ? { ...row.pco, projectId: row.projectId } : undefined;
  });
}

export async function updatePotentialChangeOrderStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  pcoId: string,
  input: UpdatePotentialChangeOrderStatusInput,
): Promise<PotentialChangeOrderRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [updated] = await tx
      .update(schema.potentialChangeOrders)
      .set({ status: input.status })
      .where(eq(schema.potentialChangeOrders.id, pcoId))
      .returning();
    if (!updated) throw new NotFoundError("Potential change order not found");
    return updated;
  });
}

export async function createChangeOrder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateChangeOrderInput,
): Promise<ChangeOrderRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    if (input.targetType === "prime") {
      const [target] = await tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.id, input.targetId)).limit(1);
      if (!target) throw new ApiError(400, "validation_error", "targetId must be an existing budget line item for a 'prime' change order");
    } else {
      const [target] = await tx.select().from(schema.commitments).where(eq(schema.commitments.id, input.targetId)).limit(1);
      if (!target) throw new ApiError(400, "validation_error", "targetId must be an existing commitment for a 'commitment' change order");
    }

    const seq = await nextSequenceNumber(tx, input.projectId, "CO");
    const [row] = await tx
      .insert(schema.changeOrders)
      .values({
        projectId: input.projectId,
        number: formatChangeOrderNumber(seq),
        title: input.title,
        pcoId: input.pcoId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        costImpact: input.costImpact.toString(),
        timeImpactDays: input.timeImpactDays,
        approvalChain: [],
        status: "draft",
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create change order");

    await writeAuditLog(tx, { actorId: userId, entityType: "change_order", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project a change order belongs to before loading the full permission context. */
export async function findChangeOrderById(appDb: Database, userId: string, changeOrderId: string): Promise<ChangeOrderRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.id, changeOrderId)).limit(1);
    return row;
  });
}

export async function listChangeOrders(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ChangeOrderRow[]> {
  requirePermission(ctx, "change_management", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.projectId, projectId));
  });
}

export async function getChangeOrder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeOrderId: string,
): Promise<ChangeOrderRow | undefined> {
  requirePermission(ctx, "change_management", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.id, changeOrderId)).limit(1);
    return row;
  });
}

export async function submitChangeOrder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeOrderId: string,
): Promise<ChangeOrderRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [co] = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.id, changeOrderId)).limit(1);
    if (!co) throw new NotFoundError("Change order not found");
    if (co.status !== "draft") throw new ApiError(400, "invalid_transition", "Only a draft change order can be submitted for approval");

    const [updated] = await tx
      .update(schema.changeOrders)
      .set({ status: "pending_approval", updatedBy: userId, updatedAt: new Date(), serverRevision: co.serverRevision + 1 })
      .where(eq(schema.changeOrders.id, changeOrderId))
      .returning();
    if (!updated) throw new Error("Failed to submit change order");
    return updated;
  });
}

async function currentApprover(tx: Tx, projectId: string, userId: string): Promise<Approver> {
  const [membership] = await tx
    .select()
    .from(schema.projectUsers)
    .where(and(eq(schema.projectUsers.projectId, projectId), eq(schema.projectUsers.userId, userId)))
    .limit(1);
  if (!membership) throw new NotFoundError("Approver is not a member of this project");
  return { userId: membership.userId, companyId: membership.companyId, role: membership.role };
}

/**
 * Approves a change order. Below the project's `changeOrderThreshold`, a
 * single approval is enough. At or above it, `requiresSecondApprover`
 * (packages/shared) demands a second approver from a *different* company
 * than the first (docs/DATA_MODEL.md §9) -- enforced here, server-side, not
 * just hidden in the UI. Approving a 'prime'-targeted order applies its
 * cost impact to the target budget line item in the same transaction as
 * the status flip, so the two can never disagree.
 */
export async function approveChangeOrder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeOrderId: string,
): Promise<ChangeOrderRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [co] = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.id, changeOrderId)).limit(1);
    if (!co) throw new NotFoundError("Change order not found");
    if (co.status !== "pending_approval") {
      throw new ApiError(400, "invalid_transition", "Only a change order pending approval can be approved");
    }

    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, co.projectId)).limit(1);
    if (!project) throw new Error("Change order references a missing project");

    const approver = await currentApprover(tx, co.projectId, userId);
    if (co.approvalChain.some((entry) => entry.userId === approver.userId)) {
      throw new ApiError(400, "already_approved", "You have already approved this change order");
    }

    const needsSecond = requiresSecondApprover(Number(co.costImpact), Number(project.changeOrderThreshold));
    const chainAfter = [...co.approvalChain, { ...approver, approvedAt: new Date().toISOString() }];

    let finalize = true;
    if (needsSecond && co.approvalChain.length === 0) {
      finalize = false;
    } else if (needsSecond && co.approvalChain.length >= 1) {
      const first = co.approvalChain[0];
      if (!first || !isValidSecondApprover(first, approver)) {
        throw new ApiError(
          403,
          "invalid_second_approver",
          "A change order at or above the project's threshold requires a second approver from a different company",
        );
      }
    }

    const newStatus = finalize ? "approved" : "pending_approval";
    const [updated] = await tx
      .update(schema.changeOrders)
      .set({
        approvalChain: chainAfter,
        status: newStatus,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: co.serverRevision + 1,
      })
      .where(eq(schema.changeOrders.id, changeOrderId))
      .returning();
    if (!updated) throw new Error("Failed to approve change order");

    if (finalize && co.targetType === "prime") {
      await applyApprovedPrimeChangeToLineItem(tx, co.targetId, Number(co.costImpact), userId);
    }

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "change_order",
      entityId: changeOrderId,
      action: finalize ? "approve" : "partial_approve",
      before: { status: co.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

/**
 * Procore's "Executed" flag: marks the change order as physically signed by
 * all parties. Distinct from `approved` status (this org's own internal
 * sign-off/approval chain) -- a change order can be Approved internally
 * before the countersigned paperwork comes back, so the two track
 * separately, same as Procore.
 */
export async function executeChangeOrder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeOrderId: string,
): Promise<ChangeOrderRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [co] = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.id, changeOrderId)).limit(1);
    if (!co) throw new NotFoundError("Change order not found");
    if (co.status !== "approved") {
      throw new ApiError(400, "invalid_transition", "Only an approved change order can be marked executed");
    }
    if (co.executed) {
      throw new ApiError(400, "already_executed", "This change order is already marked executed");
    }

    const [updated] = await tx
      .update(schema.changeOrders)
      .set({ executed: true, updatedBy: userId, updatedAt: new Date(), serverRevision: co.serverRevision + 1 })
      .where(eq(schema.changeOrders.id, changeOrderId))
      .returning();
    if (!updated) throw new Error("Failed to execute change order");

    await writeAuditLog(tx, { actorId: userId, entityType: "change_order", entityId: changeOrderId, action: "execute", before: { executed: false }, after: { executed: true } });
    return updated;
  });
}

export async function rejectChangeOrder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeOrderId: string,
): Promise<ChangeOrderRow> {
  requirePermission(ctx, "change_management", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [co] = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.id, changeOrderId)).limit(1);
    if (!co) throw new NotFoundError("Change order not found");
    if (co.status !== "pending_approval" && co.status !== "draft") {
      throw new ApiError(400, "invalid_transition", "Only a draft or pending change order can be rejected");
    }

    const [updated] = await tx
      .update(schema.changeOrders)
      .set({ status: "rejected", updatedBy: userId, updatedAt: new Date(), serverRevision: co.serverRevision + 1 })
      .where(eq(schema.changeOrders.id, changeOrderId))
      .returning();
    if (!updated) throw new Error("Failed to reject change order");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "change_order",
      entityId: changeOrderId,
      action: "reject",
      before: { status: co.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export interface ChangeOrderReportApproval {
  userName: string;
  companyName: string;
  role: string;
  approvedAt: string;
}

export interface ChangeOrderReportData extends ReportBranding {
  projectName: string;
  number: string;
  title: string | null;
  description: string | null;
  reason: ChangeReason;
  targetType: "prime" | "commitment";
  costImpact: string;
  timeImpactDays: number;
  status: ChangeStatus;
  executed: boolean;
  approvals: ChangeOrderReportApproval[];
}

/** Assembles everything the PDF report needs, mirroring inspection.service.ts's getInspectionReportData pattern. `title`/`description` come from the linked change event via its potential change order, if any -- a change order created without one (pcoId is nullable) just shows no title/description. */
export async function getChangeOrderReportData(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  changeOrderId: string,
): Promise<ChangeOrderReportData> {
  requirePermission(ctx, "change_management", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [co] = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.id, changeOrderId)).limit(1);
    if (!co) throw new NotFoundError("Change order not found");

    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, co.projectId)).limit(1);

    let title: string | null = co.title;
    let description: string | null = null;
    if (co.pcoId) {
      const [pco] = await tx.select().from(schema.potentialChangeOrders).where(eq(schema.potentialChangeOrders.id, co.pcoId)).limit(1);
      if (pco) {
        const [event] = await tx.select().from(schema.changeEvents).where(eq(schema.changeEvents.id, pco.changeEventId)).limit(1);
        title = title ?? event?.title ?? null;
        description = event?.description ?? null;
      }
    }

    const approverIds = [...new Set(co.approvalChain.map((a) => a.userId))];
    const companyIds = [...new Set(co.approvalChain.map((a) => a.companyId))];
    const [approverUsers, approverCompanies] = await Promise.all([
      approverIds.length > 0 ? tx.select().from(schema.users).where(inArray(schema.users.id, approverIds)) : Promise.resolve([]),
      companyIds.length > 0 ? tx.select().from(schema.companies).where(inArray(schema.companies.id, companyIds)) : Promise.resolve([]),
    ]);
    const userNameById = new Map(approverUsers.map((u) => [u.id, u.name]));
    const companyNameById = new Map(approverCompanies.map((c) => [c.id, c.name]));

    const branding = await resolveAuthorCompanyBranding(tx, co.projectId, co.createdBy);

    return {
      ...branding,
      projectName: project?.name ?? "",
      number: co.number,
      title,
      description,
      reason: co.reason,
      targetType: co.targetType,
      costImpact: co.costImpact,
      timeImpactDays: co.timeImpactDays,
      status: co.status,
      executed: co.executed,
      approvals: co.approvalChain.map((a) => ({
        userName: userNameById.get(a.userId) ?? "Unknown",
        companyName: companyNameById.get(a.companyId) ?? "Unknown",
        role: a.role,
        approvedAt: a.approvedAt,
      })),
    };
  });
}

export interface ChangeOrderListRow {
  number: string;
  title: string | null;
  targetType: ChangeOrderTargetType;
  status: ChangeStatus;
  executed: boolean;
  costImpact: string;
  timeImpactDays: number;
}

export interface ChangeOrderListReportData extends ReportBranding {
  projectName: string;
  rows: ChangeOrderListRow[];
}

/** "Export all" register for the project's change orders (Phase 13), branded with the requesting user's own company. */
export async function getChangeOrderListReportData(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ChangeOrderListReportData> {
  requirePermission(ctx, "change_management", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
    const changeOrders = await tx
      .select()
      .from(schema.changeOrders)
      .where(eq(schema.changeOrders.projectId, projectId))
      .orderBy(schema.changeOrders.number);

    const branding = await resolveAuthorCompanyBranding(tx, projectId, userId);

    return {
      ...branding,
      projectName: project?.name ?? "",
      rows: changeOrders.map((co) => ({
        number: co.number,
        title: co.title,
        targetType: co.targetType,
        status: co.status,
        executed: co.executed,
        costImpact: co.costImpact,
        timeImpactDays: co.timeImpactDays,
      })),
    };
  });
}
