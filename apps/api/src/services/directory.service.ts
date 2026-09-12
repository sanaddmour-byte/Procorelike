import { schema, withRequestContext, type Database } from "@siteops/db";
import { FINANCIAL_MODULES, hasPermission, PermissionDeniedError, requirePermission, type PermissionContext } from "@siteops/shared";
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

/** Cost codes are reference data shared by every T2 financial module (docs/DATA_MODEL.md §1) -- gated on read access to any one of them rather than a module of their own. */
function requireAnyFinancialReadAccess(ctx: PermissionContext): void {
  const allowed = FINANCIAL_MODULES.some((module) => hasPermission(ctx, module, "read"));
  if (!allowed) throw new PermissionDeniedError("budget", "read");
}

export async function listProjectCostCodes(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<(typeof schema.costCodes.$inferSelect)[]> {
  requireAnyFinancialReadAccess(ctx);
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId));
  });
}

export interface ProjectCompany {
  companyId: string;
  name: string;
  type: string;
  roleOnProject: string | null;
}

/** The companies actually on this project (docs/DATA_MODEL.md §1 project_companies), for pickers like "which company is this commitment/PO with" -- narrower and more correct than every company in the system. */
export async function listProjectCompanies(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ProjectCompany[]> {
  requireAnyFinancialReadAccess(ctx);
  return withRequestContext(appDb, { userId: callerUserId, role: ctx.role }, async (tx) => {
    return tx
      .select({
        companyId: schema.companies.id,
        name: schema.companies.name,
        type: schema.companies.type,
        roleOnProject: schema.projectCompanies.roleOnProject,
      })
      .from(schema.projectCompanies)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.projectCompanies.companyId))
      .where(eq(schema.projectCompanies.projectId, projectId));
  });
}
