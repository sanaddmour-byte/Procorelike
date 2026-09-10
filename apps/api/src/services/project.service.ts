import { schema, withRequestContext, type Database } from "@siteops/db";
import { defaultTemplateNameForRole, type CreateProjectInput } from "@siteops/shared";
import { eq } from "drizzle-orm";
import { ApiError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

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
