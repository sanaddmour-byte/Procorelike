import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type InstantiateActionPlanInput, type PermissionContext } from "@siteops/shared";
import { and, eq, inArray } from "drizzle-orm";
import { writeAuditLog } from "../lib/audit";

type ActionPlanRow = typeof schema.actionPlans.$inferSelect;
type CorrectiveActionRow = typeof schema.correctiveActions.$inferSelect;

export interface ActionPlanWithStatus extends ActionPlanRow {
  status: "in_progress" | "completed";
  itemCount: number;
  completedCount: number;
}

const DONE_STATUSES = new Set<CorrectiveActionRow["status"]>(["completed", "verified"]);

function withDerivedStatus(plan: ActionPlanRow, items: CorrectiveActionRow[]): ActionPlanWithStatus {
  const completedCount = items.filter((i) => DONE_STATUSES.has(i.status)).length;
  const status: ActionPlanWithStatus["status"] = items.length > 0 && completedCount === items.length ? "completed" : "in_progress";
  return { ...plan, status, itemCount: items.length, completedCount };
}

/**
 * Creates one action_plans row plus one corrective_actions row per item,
 * all in a single transaction, each stamped with the new plan's id. This
 * is the entire "instantiate a template" operation: from here on, every
 * item is tracked, transitioned, and permission-gated by the existing
 * corrective-action.service.ts code, unmodified -- an Action Plan is a
 * named batch, not a parallel tracking system.
 */
export async function instantiateActionPlan(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: InstantiateActionPlanInput,
): Promise<ActionPlanWithStatus> {
  requirePermission(ctx, "safety", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [plan] = await tx
      .insert(schema.actionPlans)
      .values({
        projectId: input.projectId,
        templateId: input.templateId,
        name: input.name,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        createdBy: userId,
      })
      .returning();
    if (!plan) throw new Error("Failed to create action plan");

    const items = await tx
      .insert(schema.correctiveActions)
      .values(
        input.items.map((item) => ({
          projectId: input.projectId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          description: item.description,
          assignedToUserId: item.assignedToUserId,
          dueDate: new Date(item.dueDate),
          actionPlanId: plan.id,
          createdBy: userId,
        })),
      )
      .returning();

    await writeAuditLog(tx, { actorId: userId, entityType: "action_plan", entityId: plan.id, action: "create", after: { ...plan, itemCount: items.length } });
    return withDerivedStatus(plan, items);
  });
}

export async function listActionPlans(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  sourceFilter?: { sourceType: string; sourceId: string },
): Promise<ActionPlanWithStatus[]> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.actionPlans.projectId, projectId)];
    if (sourceFilter) {
      conditions.push(
        eq(schema.actionPlans.sourceType, sourceFilter.sourceType as ActionPlanRow["sourceType"]),
        eq(schema.actionPlans.sourceId, sourceFilter.sourceId),
      );
    }
    const plans = await tx
      .select()
      .from(schema.actionPlans)
      .where(and(...conditions));
    if (plans.length === 0) return [];

    const planIds = plans.map((p) => p.id);
    const items = await tx.select().from(schema.correctiveActions).where(inArray(schema.correctiveActions.actionPlanId, planIds));
    const itemsByPlanId = new Map<string, CorrectiveActionRow[]>();
    for (const item of items) {
      if (!item.actionPlanId) continue;
      itemsByPlanId.set(item.actionPlanId, [...(itemsByPlanId.get(item.actionPlanId) ?? []), item]);
    }
    return plans.map((plan) => withDerivedStatus(plan, itemsByPlanId.get(plan.id) ?? []));
  });
}
