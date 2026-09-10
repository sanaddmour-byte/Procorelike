import { schema, withRequestContext, type Database } from "@siteops/db";
import { hasPermission, requirePermission, type PermissionContext } from "@siteops/shared";
import { eq } from "drizzle-orm";

export interface DirectoryMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  companyName: string;
}

/** Caller must already have at least read on the 'directory' module (checked by the route via loadPermissionContext + requirePermission). */
export async function listProjectMembers(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<DirectoryMember[]> {
  requirePermission(ctx, "directory", "read");

  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    const rows = await tx
      .select({
        userId: schema.projectUsers.userId,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.projectUsers.role,
        companyId: schema.projectUsers.companyId,
        companyName: schema.companies.name,
      })
      .from(schema.projectUsers)
      .innerJoin(schema.users, eq(schema.users.id, schema.projectUsers.userId))
      .innerJoin(schema.companies, eq(schema.companies.id, schema.projectUsers.companyId))
      .where(eq(schema.projectUsers.projectId, projectId));
    return rows;
  });
}

export function canManageDirectory(ctx: PermissionContext): boolean {
  return hasPermission(ctx, "directory", "admin");
}
