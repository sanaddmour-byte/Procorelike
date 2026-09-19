import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  levelAtLeast,
  PermissionDeniedError,
  punchItemStatusSchema,
  PUNCH_ITEM_STATUS_TRANSITIONS,
  requirePermission,
  resolveEffectiveLevel,
  rfiStatusSchema,
  RFI_STATUS_TRANSITIONS,
  type DeleteWorkflowTransitionRuleInput,
  type ListWorkflowTransitionRulesQuery,
  type Module,
  type PermissionContext,
  type UpsertWorkflowTransitionRuleInput,
} from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";

type WorkflowTransitionRuleRow = typeof schema.workflowTransitionRules.$inferSelect;

/**
 * Modules whose hardcoded status-transition machine this feature can
 * narrow. Kept to the two pilot modules (docs/ROADMAP.md's Phase 16 gate
 * report) rather than every module in MODULES, since validating a rule's
 * fromStatus/toStatus pair against "the transitions the code already
 * allows" requires that module's own transition table -- widening this
 * list means wiring enforcement into that module's own service too.
 */
function isKnownTransition(module: Module, fromStatus: string, toStatus: string): boolean {
  if (module === "rfis") {
    const from = rfiStatusSchema.safeParse(fromStatus);
    const to = rfiStatusSchema.safeParse(toStatus);
    return from.success && to.success && RFI_STATUS_TRANSITIONS[from.data].includes(to.data);
  }
  if (module === "punch_list") {
    const from = punchItemStatusSchema.safeParse(fromStatus);
    const to = punchItemStatusSchema.safeParse(toStatus);
    return from.success && to.success && PUNCH_ITEM_STATUS_TRANSITIONS[from.data].includes(to.data);
  }
  return false;
}

export async function listWorkflowTransitionRules(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  query: ListWorkflowTransitionRulesQuery,
): Promise<WorkflowTransitionRuleRow[]> {
  if (query.module) requirePermission(ctx, query.module, "read");
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.workflowTransitionRules.projectId, query.projectId)];
    if (query.module) conditions.push(eq(schema.workflowTransitionRules.module, query.module));
    return tx
      .select()
      .from(schema.workflowTransitionRules)
      .where(and(...conditions));
  });
}

/** directory:admin gates configuring workflow rules -- same "an admin manages every module's structure from one place" convention as custom fields. */
export async function upsertWorkflowTransitionRule(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  input: UpsertWorkflowTransitionRuleInput,
): Promise<WorkflowTransitionRuleRow> {
  requirePermission(ctx, "directory", "admin");
  if (!isKnownTransition(input.module, input.fromStatus, input.toStatus)) {
    throw new ApiError(
      400,
      "unsupported_transition",
      `'${input.fromStatus}' -> '${input.toStatus}' is not a transition '${input.module}' supports, or '${input.module}' does not support workflow rules yet`,
    );
  }
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.workflowTransitionRules)
      .where(
        and(
          eq(schema.workflowTransitionRules.projectId, input.projectId),
          eq(schema.workflowTransitionRules.module, input.module),
          eq(schema.workflowTransitionRules.fromStatus, input.fromStatus),
          eq(schema.workflowTransitionRules.toStatus, input.toStatus),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(schema.workflowTransitionRules)
        .set({ enabled: input.enabled, requiredLevel: input.requiredLevel })
        .where(eq(schema.workflowTransitionRules.id, existing.id))
        .returning();
      if (!updated) throw new Error("Failed to update workflow transition rule");
      return updated;
    }

    const [created] = await tx
      .insert(schema.workflowTransitionRules)
      .values({
        projectId: input.projectId,
        module: input.module,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        enabled: input.enabled,
        requiredLevel: input.requiredLevel,
      })
      .returning();
    if (!created) throw new Error("Failed to create workflow transition rule");
    return created;
  });
}

export async function deleteWorkflowTransitionRule(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  ruleId: string,
  input: DeleteWorkflowTransitionRuleInput,
): Promise<void> {
  requirePermission(ctx, "directory", "admin");
  await withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const deleted = await tx
      .delete(schema.workflowTransitionRules)
      .where(and(eq(schema.workflowTransitionRules.id, ruleId), eq(schema.workflowTransitionRules.projectId, input.projectId)))
      .returning({ id: schema.workflowTransitionRules.id });
    if (deleted.length === 0) throw new NotFoundError("Workflow transition rule not found");
  });
}

/**
 * Called from inside a module's own transitionXStatus, after its hardcoded
 * transition table has already accepted the move -- this can only make
 * that accepted move stricter (blocked outright, or gated behind a higher
 * permission level than the module's own base check), never allow one the
 * module's transition table rejects.
 */
export async function enforceWorkflowTransitionRule(
  tx: Tx,
  ctx: PermissionContext,
  module: Module,
  projectId: string,
  fromStatus: string,
  toStatus: string,
): Promise<void> {
  const [rule] = await tx
    .select()
    .from(schema.workflowTransitionRules)
    .where(
      and(
        eq(schema.workflowTransitionRules.projectId, projectId),
        eq(schema.workflowTransitionRules.module, module),
        eq(schema.workflowTransitionRules.fromStatus, fromStatus),
        eq(schema.workflowTransitionRules.toStatus, toStatus),
      ),
    )
    .limit(1);
  if (!rule) return;
  if (!rule.enabled) {
    throw new ApiError(
      403,
      "transition_disabled",
      `An administrator has disabled the '${fromStatus}' -> '${toStatus}' transition for this project`,
    );
  }
  if (!levelAtLeast(resolveEffectiveLevel(ctx, module), rule.requiredLevel)) {
    throw new PermissionDeniedError(module, rule.requiredLevel);
  }
}
