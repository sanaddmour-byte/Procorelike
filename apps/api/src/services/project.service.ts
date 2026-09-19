import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  defaultTemplateNameForRole,
  requirePermission,
  type CreateProjectInput,
  type PermissionContext,
  type UpdateProjectSettingsInput,
} from "@siteops/shared";
import { eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

export async function createProject(
  appDb: Database,
  creatorUserId: string,
  input: CreateProjectInput,
): Promise<typeof schema.projects.$inferSelect> {
  return withRequestContext(appDb, { userId: creatorUserId }, async (tx) => {
    const [creatorCompany] = await tx
      .select()
      .from(schema.userCompanies)
      .where(eq(schema.userCompanies.userId, creatorUserId))
      .limit(1);
    if (!creatorCompany) {
      throw new ApiError(
        400,
        "no_company",
        "You must belong to a company before creating a project",
      );
    }

    const [project] = await tx
      .insert(schema.projects)
      .values({
        ...input,
        // Drizzle's pg `numeric` columns are string-typed (avoids float
        // precision loss); the zod schema accepts numbers for API ergonomics.
        lat: input.lat?.toString(),
        lng: input.lng?.toString(),
        createdBy: creatorUserId,
      })
      .returning();
    if (!project) throw new Error("Failed to create project");

    const [ownerAdminTemplate] = await tx
      .select()
      .from(schema.permissionTemplates)
      .where(eq(schema.permissionTemplates.name, defaultTemplateNameForRole("owner_admin")))
      .limit(1);

    await tx.insert(schema.projectUsers).values({
      projectId: project.id,
      userId: creatorUserId,
      companyId: creatorCompany.companyId,
      role: "owner_admin",
      permissionTemplateId: ownerAdminTemplate?.id,
    });

    await writeAuditLog(tx, {
      actorId: creatorUserId,
      entityType: "project",
      entityId: project.id,
      action: "create",
      after: project,
    });

    return project;
  });
}

/** RLS does the actual scoping here — a plain unfiltered SELECT against the caller's session context returns exactly the projects they're a member of. */
export async function listMyProjects(
  appDb: Database,
  userId: string,
): Promise<(typeof schema.projects.$inferSelect)[]> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    return tx.select().from(schema.projects);
  });
}

/**
 * General project-settings panel (defaultCurrency, changeOrderThreshold,
 * timezone) — directory:admin gated, same convention as permission
 * templates. These fields previously had no update path past project
 * creation.
 */
export async function updateProjectSettings(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
  input: UpdateProjectSettingsInput,
): Promise<typeof schema.projects.$inferSelect> {
  requirePermission(ctx, "directory", "admin");
  return withUserContext(appDb, callerUserId, async (tx) => {
    const [before] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
    if (!before) throw new NotFoundError("Project not found");

    const patch: { defaultCurrency?: string; changeOrderThreshold?: string; timezone?: string } = {};
    if (input.defaultCurrency !== undefined) patch.defaultCurrency = input.defaultCurrency;
    if (input.changeOrderThreshold !== undefined) patch.changeOrderThreshold = input.changeOrderThreshold.toString();
    if (input.timezone !== undefined) patch.timezone = input.timezone;

    const [updated] = await tx.update(schema.projects).set(patch).where(eq(schema.projects.id, projectId)).returning();
    if (!updated) throw new Error("Failed to update project settings");

    await writeAuditLog(tx, {
      actorId: callerUserId,
      entityType: "project",
      entityId: projectId,
      action: "update_settings",
      before,
      after: updated,
    });

    return updated;
  });
}
