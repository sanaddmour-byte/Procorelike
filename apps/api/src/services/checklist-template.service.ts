import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type CreateChecklistTemplateInput, type PermissionContext } from "@siteops/shared";
import { eq, isNull, or } from "drizzle-orm";
import { withUserContext } from "./permission.service";

type ChecklistTemplateRow = typeof schema.checklistTemplates.$inferSelect;
type ChecklistTemplateItemRow = typeof schema.checklistTemplateItems.$inferSelect;

export interface ChecklistTemplateDetail extends ChecklistTemplateRow {
  items: ChecklistTemplateItemRow[];
}

export async function createChecklistTemplate(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateChecklistTemplateInput,
): Promise<ChecklistTemplateDetail> {
  requirePermission(ctx, "inspections", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [template] = await tx
      .insert(schema.checklistTemplates)
      .values({ projectId: input.projectId, title: input.title, createdBy: userId })
      .returning();
    if (!template) throw new Error("Failed to create checklist template");

    const items = await tx
      .insert(schema.checklistTemplateItems)
      .values(input.items.map((item) => ({ templateId: template.id, prompt: item.prompt, responseType: item.responseType, order: item.order })))
      .returning();

    return { ...template, items };
  });
}

export async function listChecklistTemplates(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ChecklistTemplateRow[]> {
  requirePermission(ctx, "inspections", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx
      .select()
      .from(schema.checklistTemplates)
      .where(or(isNull(schema.checklistTemplates.projectId), eq(schema.checklistTemplates.projectId, projectId)));
  });
}

/** Peek used by routes that only have a templateId (e.g. resolving a template's items before creating an inspection) — no project-scoped permission context needed since template content isn't itself tenant-sensitive (docs/ARCHITECTURE.md §7a-adjacent reasoning: only inspection *results* are). */
export async function getChecklistTemplate(appDb: Database, userId: string, templateId: string): Promise<ChecklistTemplateDetail | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [template] = await tx.select().from(schema.checklistTemplates).where(eq(schema.checklistTemplates.id, templateId)).limit(1);
    if (!template) return undefined;
    const items = await tx
      .select()
      .from(schema.checklistTemplateItems)
      .where(eq(schema.checklistTemplateItems.templateId, templateId));
    return { ...template, items };
  });
}
