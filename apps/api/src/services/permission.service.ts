import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  requirePermission,
  type AssignPermissionTemplateInput,
  type Module,
  type ModuleLevels,
  type PermissionContext,
  type PermissionLevel,
  type PermissionTemplateInput,
  type UpdatePermissionTemplateInput,
} from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";

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

/**
 * Permission templates (packages/db schema.permissionTemplates) are global,
 * reusable across every project -- there is no owning project to check
 * membership against, so every write here is instead gated on the caller
 * being directory:admin on the project named in the request body, mirroring
 * how Procore manages templates from within a project's People settings
 * even though the template itself is shared.
 */
export async function listPermissionTemplates(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
): Promise<(typeof schema.permissionTemplates.$inferSelect)[]> {
  requirePermission(ctx, "directory", "read");
  return withUserContext(appDb, callerUserId, async (tx) => {
    return tx.select().from(schema.permissionTemplates).orderBy(schema.permissionTemplates.name);
  });
}

export async function createPermissionTemplate(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  input: PermissionTemplateInput,
): Promise<typeof schema.permissionTemplates.$inferSelect> {
  requirePermission(ctx, "directory", "admin");
  return withUserContext(appDb, callerUserId, async (tx) => {
    const [created] = await tx
      .insert(schema.permissionTemplates)
      .values({ name: input.name, levels: input.levels })
      .returning();
    if (!created) throw new Error("Failed to create permission template");
    return created;
  });
}

export async function updatePermissionTemplate(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  templateId: string,
  input: UpdatePermissionTemplateInput,
): Promise<typeof schema.permissionTemplates.$inferSelect> {
  requirePermission(ctx, "directory", "admin");
  return withUserContext(appDb, callerUserId, async (tx) => {
    const patch: { name?: string; levels?: Record<string, string> } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.levels !== undefined) patch.levels = input.levels;
    const [updated] = await tx
      .update(schema.permissionTemplates)
      .set(patch)
      .where(eq(schema.permissionTemplates.id, templateId))
      .returning();
    if (!updated) throw new NotFoundError("Permission template not found");
    return updated;
  });
}

export async function deletePermissionTemplate(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  templateId: string,
): Promise<void> {
  requirePermission(ctx, "directory", "admin");
  await withUserContext(appDb, callerUserId, async (tx) => {
    const [inUse] = await tx
      .select({ id: schema.projectUsers.id })
      .from(schema.projectUsers)
      .where(eq(schema.projectUsers.permissionTemplateId, templateId))
      .limit(1);
    if (inUse) {
      throw new ApiError(400, "template_in_use", "This permission template is assigned to at least one project member and cannot be deleted");
    }
    const deleted = await tx
      .delete(schema.permissionTemplates)
      .where(eq(schema.permissionTemplates.id, templateId))
      .returning({ id: schema.permissionTemplates.id });
    if (deleted.length === 0) throw new NotFoundError("Permission template not found");
  });
}

export interface MemberPermissions {
  userId: string;
  name: string;
  email: string;
  role: string;
  permissionTemplateId: string | null;
  templateName: string | null;
  templateLevels: ModuleLevels;
  overrides: ModuleLevels;
}

/** Powers the Permissions admin screen: every project member, their assigned template's levels, and any per-user overrides -- everything resolveEffectiveLevel needs, laid out for editing rather than just the resolved result. */
export async function listMemberPermissions(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<MemberPermissions[]> {
  requirePermission(ctx, "directory", "admin");
  return withUserContext(appDb, callerUserId, async (tx) => {
    const members = await tx
      .select({
        userId: schema.projectUsers.userId,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.projectUsers.role,
        permissionTemplateId: schema.projectUsers.permissionTemplateId,
        templateName: schema.permissionTemplates.name,
        templateLevels: schema.permissionTemplates.levels,
      })
      .from(schema.projectUsers)
      .innerJoin(schema.users, eq(schema.users.id, schema.projectUsers.userId))
      .leftJoin(schema.permissionTemplates, eq(schema.permissionTemplates.id, schema.projectUsers.permissionTemplateId))
      .where(eq(schema.projectUsers.projectId, projectId));

    const overrideRows = await tx
      .select()
      .from(schema.projectUserPermissions)
      .where(eq(schema.projectUserPermissions.projectId, projectId));
    const overridesByUser = new Map<string, ModuleLevels>();
    for (const row of overrideRows) {
      const bucket = overridesByUser.get(row.userId) ?? {};
      bucket[row.module] = row.level;
      overridesByUser.set(row.userId, bucket);
    }

    return members.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
      permissionTemplateId: m.permissionTemplateId,
      templateName: m.templateName,
      templateLevels: (m.templateLevels as ModuleLevels | null) ?? {},
      overrides: overridesByUser.get(m.userId) ?? {},
    }));
  });
}

export async function assignPermissionTemplate(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
  targetUserId: string,
  input: AssignPermissionTemplateInput,
): Promise<void> {
  requirePermission(ctx, "directory", "admin");
  await withUserContext(appDb, callerUserId, async (tx) => {
    const updated = await tx
      .update(schema.projectUsers)
      .set({ permissionTemplateId: input.permissionTemplateId })
      .where(and(eq(schema.projectUsers.projectId, projectId), eq(schema.projectUsers.userId, targetUserId)))
      .returning({ id: schema.projectUsers.id });
    if (updated.length === 0) throw new NotFoundError("Project member not found");
  });
}

export async function setPermissionOverride(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
  targetUserId: string,
  module: Module,
  level: PermissionLevel,
): Promise<void> {
  requirePermission(ctx, "directory", "admin");
  await withUserContext(appDb, callerUserId, async (tx) => {
    const [existing] = await tx
      .select({ id: schema.projectUserPermissions.id })
      .from(schema.projectUserPermissions)
      .where(
        and(
          eq(schema.projectUserPermissions.projectId, projectId),
          eq(schema.projectUserPermissions.userId, targetUserId),
          eq(schema.projectUserPermissions.module, module),
        ),
      )
      .limit(1);
    if (existing) {
      await tx.update(schema.projectUserPermissions).set({ level }).where(eq(schema.projectUserPermissions.id, existing.id));
    } else {
      await tx.insert(schema.projectUserPermissions).values({ projectId, userId: targetUserId, module, level });
    }
  });
}

export async function clearPermissionOverride(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
  targetUserId: string,
  module: Module,
): Promise<void> {
  requirePermission(ctx, "directory", "admin");
  await withUserContext(appDb, callerUserId, async (tx) => {
    await tx
      .delete(schema.projectUserPermissions)
      .where(
        and(
          eq(schema.projectUserPermissions.projectId, projectId),
          eq(schema.projectUserPermissions.userId, targetUserId),
          eq(schema.projectUserPermissions.module, module),
        ),
      );
  });
}
