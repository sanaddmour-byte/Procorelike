import { schema, withRequestContext, type Database } from "@siteops/db";
import type { ModuleLevels, PermissionContext } from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";

/** Resolves the caller's PermissionContext for a project, for @siteops/shared's requirePermission/hasPermission. Throws NotFoundError if they aren't a member (RLS would hide the project row from them anyway). */
export async function loadPermissionContext(
  appDb: Database,
  userId: string,
  projectId: string,
): Promise<PermissionContext> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [membership] = await tx
      .select()
      .from(schema.projectUsers)
      .where(and(eq(schema.projectUsers.projectId, projectId), eq(schema.projectUsers.userId, userId)))
      .limit(1);
    if (!membership) {
      throw new NotFoundError("Project not found or you are not a member");
    }

    let templateLevels: ModuleLevels = {};
    if (membership.permissionTemplateId) {
      const [template] = await tx
        .select()
        .from(schema.permissionTemplates)
        .where(eq(schema.permissionTemplates.id, membership.permissionTemplateId))
        .limit(1);
      if (template) {
        templateLevels = template.levels as ModuleLevels;
      }
    }

    const overrideRows = await tx
      .select()
      .from(schema.projectUserPermissions)
      .where(
        and(
          eq(schema.projectUserPermissions.projectId, projectId),
          eq(schema.projectUserPermissions.userId, userId),
        ),
      );
    const overrides: ModuleLevels = {};
    for (const row of overrideRows) {
      overrides[row.module] = row.level;
    }

    return { role: membership.role, templateLevels, overrides };
  });
}
