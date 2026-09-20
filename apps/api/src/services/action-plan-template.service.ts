import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  requirePermission,
  type CreateActionPlanTemplateInput,
  type CreateActionPlanTemplateItemInput,
  type PermissionContext,
  type UpdateActionPlanTemplateInput,
  type UpdateActionPlanTemplateItemInput,
} from "@siteops/shared";
import { asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";

type ActionPlanTemplateRow = typeof schema.actionPlanTemplates.$inferSelect;
type ActionPlanTemplateItemRow = typeof schema.actionPlanTemplateItems.$inferSelect;

export interface ActionPlanTemplateDetail extends ActionPlanTemplateRow {
  items: ActionPlanTemplateItemRow[];
}

/**
 * Action Plan templates are gated `directory:admin` for writes -- same
 * "an admin manages structure from one place" convention as custom field
 * definitions and workflow transition rules -- but `safety:read` for
 * listing, since the pilot consumer (Corrective Actions on safety
 * incidents/observations) needs any project member who can already see
 * corrective actions to pick a template when applying one.
 */
export async function listActionPlanTemplates(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ActionPlanTemplateRow[]> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.actionPlanTemplates).where(eq(schema.actionPlanTemplates.projectId, projectId)).orderBy(asc(schema.actionPlanTemplates.name));
  });
}

export async function getActionPlanTemplate(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  templateId: string,
): Promise<ActionPlanTemplateDetail> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const [template] = await tx.select().from(schema.actionPlanTemplates).where(eq(schema.actionPlanTemplates.id, templateId)).limit(1);
    if (!template) throw new NotFoundError("Action plan template not found");
    const items = await tx
      .select()
      .from(schema.actionPlanTemplateItems)
      .where(eq(schema.actionPlanTemplateItems.templateId, templateId))
      .orderBy(asc(schema.actionPlanTemplateItems.sortOrder));
    return { ...template, items };
  });
}

export async function createActionPlanTemplate(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  input: CreateActionPlanTemplateInput,
): Promise<ActionPlanTemplateRow> {
  requirePermission(ctx, "directory", "admin");
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const [created] = await tx
      .insert(schema.actionPlanTemplates)
      .values({ projectId: input.projectId, name: input.name, description: input.description, createdBy: callerUserId })
      .returning();
    if (!created) throw new Error("Failed to create action plan template");
    return created;
  });
}

export async function updateActionPlanTemplate(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  templateId: string,
  input: UpdateActionPlanTemplateInput,
): Promise<ActionPlanTemplateRow> {
  requirePermission(ctx, "directory", "admin");
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const patch: Partial<Pick<ActionPlanTemplateRow, "name" | "description" | "updatedAt">> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    const [updated] = await tx.update(schema.actionPlanTemplates).set(patch).where(eq(schema.actionPlanTemplates.id, templateId)).returning();
    if (!updated) throw new NotFoundError("Action plan template not found");
    return updated;
  });
}

export async function deleteActionPlanTemplate(appDb: Database, callerUserId: string, ctx: PermissionContext, templateId: string): Promise<void> {
  requirePermission(ctx, "directory", "admin");
  await withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const deleted = await tx.delete(schema.actionPlanTemplates).where(eq(schema.actionPlanTemplates.id, templateId)).returning({ id: schema.actionPlanTemplates.id });
    if (deleted.length === 0) throw new NotFoundError("Action plan template not found");
  });
}

export async function createActionPlanTemplateItem(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  templateId: string,
  input: CreateActionPlanTemplateItemInput,
): Promise<ActionPlanTemplateItemRow> {
  requirePermission(ctx, "directory", "admin");
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const [created] = await tx
      .insert(schema.actionPlanTemplateItems)
      .values({ templateId, description: input.description, defaultDueDays: input.defaultDueDays, sortOrder: input.sortOrder ?? 0 })
      .returning();
    if (!created) throw new Error("Failed to create action plan template item");
    return created;
  });
}

export async function updateActionPlanTemplateItem(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  itemId: string,
  input: UpdateActionPlanTemplateItemInput,
): Promise<ActionPlanTemplateItemRow> {
  requirePermission(ctx, "directory", "admin");
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const patch: Partial<Pick<ActionPlanTemplateItemRow, "description" | "defaultDueDays" | "sortOrder">> = {};
    if (input.description !== undefined) patch.description = input.description;
    if (input.defaultDueDays !== undefined) patch.defaultDueDays = input.defaultDueDays;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    const [updated] = await tx.update(schema.actionPlanTemplateItems).set(patch).where(eq(schema.actionPlanTemplateItems.id, itemId)).returning();
    if (!updated) throw new NotFoundError("Action plan template item not found");
    return updated;
  });
}

export async function deleteActionPlanTemplateItem(appDb: Database, callerUserId: string, ctx: PermissionContext, itemId: string): Promise<void> {
  requirePermission(ctx, "directory", "admin");
  await withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const deleted = await tx.delete(schema.actionPlanTemplateItems).where(eq(schema.actionPlanTemplateItems.id, itemId)).returning({ id: schema.actionPlanTemplateItems.id });
    if (deleted.length === 0) throw new NotFoundError("Action plan template item not found");
  });
}
