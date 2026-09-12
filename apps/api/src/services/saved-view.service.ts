import { schema, withRequestContext, type Database } from "@siteops/db";
import { isModule, requirePermission, type CreateSavedViewInput, type PermissionContext } from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";

type SavedViewRow = typeof schema.savedViews.$inferSelect;

/** RLS (`saved_views_self`) already restricts every read/write here to the caller's own rows -- this service doesn't need to re-filter by userId to enforce privacy, only to set it on insert. */
export async function createSavedView(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateSavedViewInput,
): Promise<SavedViewRow> {
  if (!isModule(input.module)) throw new ApiError(400, "validation_error", "Unknown module");
  requirePermission(ctx, input.module, "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.savedViews)
      .values({ projectId: input.projectId, userId, module: input.module, name: input.name, filters: input.filters })
      .returning();
    if (!row) throw new Error("Failed to create saved view");
    return row;
  });
}

export async function listSavedViews(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  moduleParam: string,
): Promise<SavedViewRow[]> {
  if (!isModule(moduleParam)) throw new ApiError(400, "validation_error", "Unknown module");
  requirePermission(ctx, moduleParam, "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx
      .select()
      .from(schema.savedViews)
      .where(and(eq(schema.savedViews.projectId, projectId), eq(schema.savedViews.module, moduleParam)));
  });
}

export async function deleteSavedView(appDb: Database, userId: string, ctx: PermissionContext, savedViewId: string): Promise<void> {
  await withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.savedViews).where(eq(schema.savedViews.id, savedViewId)).limit(1);
    if (!existing) throw new NotFoundError("Saved view not found");
    await tx.delete(schema.savedViews).where(eq(schema.savedViews.id, savedViewId));
  });
}
