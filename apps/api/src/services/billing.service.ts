import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  computeLineAmounts,
  PAYMENT_APPLICATION_STATUS_TRANSITIONS,
  requirePermission,
  sumNetThisPeriod,
  type CreatePaymentApplicationInput,
  type PaymentApplicationLineAmounts,
  type PaymentApplicationStatus,
  type PermissionContext,
  type SetPaymentApplicationLinesInput,
  type TransitionPaymentApplicationStatusInput,
} from "@siteops/shared";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type PaymentApplicationRow = typeof schema.paymentApplications.$inferSelect;
type PaymentApplicationLineRow = typeof schema.paymentApplicationLines.$inferSelect;

export interface PaymentApplicationLineDetail extends PaymentApplicationLineRow, PaymentApplicationLineAmounts {
  description: string;
  scheduleOfValuesAmount: number;
}

export interface PaymentApplicationDetail extends PaymentApplicationRow {
  lines: PaymentApplicationLineDetail[];
  totalNetThisPeriod: number;
}

export async function createPaymentApplication(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreatePaymentApplicationInput,
): Promise<PaymentApplicationRow> {
  requirePermission(ctx, "progress_billing", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.paymentApplications)
      .values({
        projectId: input.projectId,
        commitmentId: input.commitmentId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        retentionPct: input.retentionPct.toString(),
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create payment application");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "payment_application",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });
}

/** Peek used by routes to resolve which project a payment application belongs to before loading the full permission context. */
export async function findPaymentApplicationById(
  appDb: Database,
  userId: string,
  paymentApplicationId: string,
): Promise<PaymentApplicationRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.paymentApplications)
      .where(eq(schema.paymentApplications.id, paymentApplicationId))
      .limit(1);
    return row;
  });
}

export async function listPaymentApplications(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<PaymentApplicationRow[]> {
  requirePermission(ctx, "progress_billing", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.paymentApplications).where(eq(schema.paymentApplications.projectId, projectId));
  });
}

export async function getPaymentApplication(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  paymentApplicationId: string,
): Promise<PaymentApplicationDetail | undefined> {
  requirePermission(ctx, "progress_billing", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [application] = await tx
      .select()
      .from(schema.paymentApplications)
      .where(eq(schema.paymentApplications.id, paymentApplicationId))
      .limit(1);
    if (!application) return undefined;

    const lineRows = await tx
      .select()
      .from(schema.paymentApplicationLines)
      .where(eq(schema.paymentApplicationLines.paymentApplicationId, paymentApplicationId));

    const lines: PaymentApplicationLineDetail[] = [];
    for (const line of lineRows) {
      const [sov] = await tx
        .select()
        .from(schema.commitmentLineItems)
        .where(eq(schema.commitmentLineItems.id, line.sovLineId))
        .limit(1);
      if (!sov) continue;

      const amounts = computeLineAmounts(
        Number(sov.scheduleOfValuesAmount),
        Number(line.pctCompletePrevious),
        Number(line.pctCompleteThisPeriod),
        Number(application.retentionPct),
      );
      lines.push({
        ...line,
        description: sov.description,
        scheduleOfValuesAmount: Number(sov.scheduleOfValuesAmount),
        ...amounts,
      });
    }

    return { ...application, lines, totalNetThisPeriod: sumNetThisPeriod(lines) };
  });
}

export async function setPaymentApplicationLines(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  paymentApplicationId: string,
  input: SetPaymentApplicationLinesInput,
): Promise<PaymentApplicationLineRow[]> {
  requirePermission(ctx, "progress_billing", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [application] = await tx
      .select()
      .from(schema.paymentApplications)
      .where(eq(schema.paymentApplications.id, paymentApplicationId))
      .limit(1);
    if (!application) throw new NotFoundError("Payment application not found");
    if (application.status !== "draft") throw new ApiError(400, "validation_error", "Only a draft payment application's lines can be edited");

    await tx
      .delete(schema.paymentApplicationLines)
      .where(eq(schema.paymentApplicationLines.paymentApplicationId, paymentApplicationId));

    const rows: PaymentApplicationLineRow[] = [];
    for (const line of input.lines) {
      const pctCompletePrevious = await previousPctComplete(tx, application, line.sovLineId);
      const [row] = await tx
        .insert(schema.paymentApplicationLines)
        .values({
          paymentApplicationId,
          sovLineId: line.sovLineId,
          pctCompletePrevious: pctCompletePrevious.toString(),
          pctCompleteThisPeriod: line.pctCompleteThisPeriod.toString(),
        })
        .returning();
      if (!row) throw new Error("Failed to set payment application line");
      rows.push(row);
    }
    return rows;
  });
}

/**
 * `pctCompletePrevious` is never entered by hand -- it's the this-period %
 * from the most recent earlier application against the same commitment
 * (docs/DATA_MODEL.md §9: "computed, not stored redundantly where
 * derivable"), so a chain of applications can't drift from actual history.
 * 0 for a line's first-ever application.
 */
async function previousPctComplete(
  tx: Tx,
  application: PaymentApplicationRow,
  sovLineId: string,
): Promise<number> {
  const priorApps = await tx
    .select()
    .from(schema.paymentApplications)
    .where(
      and(
        application.commitmentId
          ? eq(schema.paymentApplications.commitmentId, application.commitmentId)
          : eq(schema.paymentApplications.projectId, application.projectId),
        lt(schema.paymentApplications.periodEnd, application.periodEnd),
        ne(schema.paymentApplications.id, application.id),
      ),
    )
    .orderBy(desc(schema.paymentApplications.periodEnd));

  for (const priorApp of priorApps) {
    const [priorLine] = await tx
      .select()
      .from(schema.paymentApplicationLines)
      .where(
        and(
          eq(schema.paymentApplicationLines.paymentApplicationId, priorApp.id),
          eq(schema.paymentApplicationLines.sovLineId, sovLineId),
        ),
      )
      .limit(1);
    if (priorLine) return Number(priorLine.pctCompleteThisPeriod);
  }
  return 0;
}

export async function transitionPaymentApplicationStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  paymentApplicationId: string,
  input: TransitionPaymentApplicationStatusInput,
): Promise<PaymentApplicationRow> {
  requirePermission(ctx, "progress_billing", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [application] = await tx
      .select()
      .from(schema.paymentApplications)
      .where(eq(schema.paymentApplications.id, paymentApplicationId))
      .limit(1);
    if (!application) throw new NotFoundError("Payment application not found");

    const allowed: readonly PaymentApplicationStatus[] = PAYMENT_APPLICATION_STATUS_TRANSITIONS[application.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(400, "invalid_transition", `Cannot move payment application from '${application.status}' to '${input.toStatus}'`);
    }

    const [updated] = await tx
      .update(schema.paymentApplications)
      .set({ status: input.toStatus, updatedBy: userId, updatedAt: new Date(), serverRevision: application.serverRevision + 1 })
      .where(eq(schema.paymentApplications.id, paymentApplicationId))
      .returning();
    if (!updated) throw new Error("Failed to transition payment application status");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "payment_application",
      entityId: paymentApplicationId,
      action: "transition",
      before: { status: application.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
