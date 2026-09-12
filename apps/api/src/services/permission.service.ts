import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import type { ModuleLevels, PermissionContext } from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";

/**
 * Every read/write against a tenant-scoped table must set RLS session
 * context first — including a "peek at this record to find its project_id"
 * pre-lookup before the real permission check runs. A raw `appDb.select()`
 * with no context looks harmless (RLS just returns nothing), but on a
 * pooled connection previously used by a *different* withRequestContext
 * call, Postgres's custom-GUC-placeholder semantics make
 * current_setting('app.user_id', true) come back as '' rather than NULL,
 * and ''::uuid throws (see the comment in
 * packages/db/src/sql/001_rls_and_functions.sql §2). Route handlers should
 * use this instead of calling `appDb` directly for any such pre-lookup.
 */
export async function withUserContext<T>(appDb: Database, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withRequestContext(appDb, { userId }, fn);
}

export async function findProjectById(
  appDb: Database,
  userId: string,
  projectId: string,
): Promise<typeof schema.projects.$inferSelect | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
    return project;
  });
}

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
