import { schema, withRequestContext, type Database } from "@siteops/db";
import { hasPermission, type PermissionContext } from "@siteops/shared";
import { eq } from "drizzle-orm";

export interface RfiRollup {
  total: number;
  open: number;
  overdue: number;
}

export interface PunchListRollup {
  total: number;
  byStatus: Record<string, number>;
}

export interface BudgetRollup {
  originalTotal: number;
  approvedChangesTotal: number;
  revisedTotal: number;
  projectedTotal: number;
  varianceTotal: number;
}

export interface ChangeOrderRollup {
  total: number;
  byStatus: Record<string, number>;
}

export interface ActionRequiredItem {
  type: "rfi_overdue" | "submittal_in_review" | "schedule_task_delayed" | "change_order_pending_approval";
  count: number;
}

export interface ProjectDashboard {
  rfis?: RfiRollup;
  punchList?: PunchListRollup;
  budget?: BudgetRollup;
  changeOrders?: ChangeOrderRollup;
  actionRequired: ActionRequiredItem[];
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

/**
 * Each section is independently gated on that module's own read
 * permission and simply omitted (not a 403) if the caller can't see it --
 * a client_viewer gets RFI/Punch List rollups but no budget/change-order
 * section, the same shape the permission engine already enforces
 * per-module everywhere else, just applied at section granularity instead
 * of failing the whole request.
 */
export async function getProjectDashboard(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ProjectDashboard> {
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const dashboard: ProjectDashboard = { actionRequired: [] };

    if (hasPermission(ctx, "rfis", "read")) {
      const rows = await tx.select().from(schema.rfis).where(eq(schema.rfis.projectId, projectId));
      const now = Date.now();
      const open = rows.filter((r) => r.status === "open");
      const overdue = open.filter((r) => r.dueDate !== null && r.dueDate.getTime() < now);
      dashboard.rfis = { total: rows.length, open: open.length, overdue: overdue.length };
      if (overdue.length > 0) dashboard.actionRequired.push({ type: "rfi_overdue", count: overdue.length });
    }

    if (hasPermission(ctx, "punch_list", "read")) {
      const rows = await tx.select().from(schema.punchItems).where(eq(schema.punchItems.projectId, projectId));
      dashboard.punchList = { total: rows.length, byStatus: countBy(rows.map((r) => r.status)) };
    }

    if (hasPermission(ctx, "budget", "read")) {
      const rows = await tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.projectId, projectId));
      const originalTotal = rows.reduce((sum, r) => sum + Number(r.originalAmount), 0);
      const approvedChangesTotal = rows.reduce((sum, r) => sum + Number(r.approvedChangesAmount), 0);
      const projectedTotal = rows.reduce((sum, r) => sum + Number(r.projectedAmount), 0);
      const revisedTotal = originalTotal + approvedChangesTotal;
      dashboard.budget = { originalTotal, approvedChangesTotal, revisedTotal, projectedTotal, varianceTotal: revisedTotal - projectedTotal };
    }

    if (hasPermission(ctx, "change_management", "read")) {
      const rows = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.projectId, projectId));
      dashboard.changeOrders = { total: rows.length, byStatus: countBy(rows.map((r) => r.status)) };
      const pendingApproval = rows.filter((r) => r.status === "pending_approval");
      if (pendingApproval.length > 0) dashboard.actionRequired.push({ type: "change_order_pending_approval", count: pendingApproval.length });
    }

    if (hasPermission(ctx, "submittals", "read")) {
      const rows = await tx.select().from(schema.submittals).where(eq(schema.submittals.projectId, projectId));
      const inReview = rows.filter((r) => r.status === "in_review");
      if (inReview.length > 0) dashboard.actionRequired.push({ type: "submittal_in_review", count: inReview.length });
    }

    if (hasPermission(ctx, "schedule", "read")) {
      const rows = await tx.select().from(schema.scheduleTasks).where(eq(schema.scheduleTasks.projectId, projectId));
      const delayed = rows.filter((r) => r.status === "delayed");
      if (delayed.length > 0) dashboard.actionRequired.push({ type: "schedule_task_delayed", count: delayed.length });
    }

    return dashboard;
  });
}
