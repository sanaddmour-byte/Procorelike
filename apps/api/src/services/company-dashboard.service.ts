import { schema, withRequestContext, type Database } from "@siteops/db";
import { and, eq } from "drizzle-orm";
import { ApiError } from "../lib/errors";
import { getProjectDashboard, type ProjectDashboard } from "./dashboard.service";
import { loadPermissionContext } from "./permission.service";

export interface CompanyProjectDashboard {
  projectId: string;
  projectName: string;
  dashboard: ProjectDashboard;
}

/**
 * Cross-project portfolio rollup for a company -- loops the company's
 * projects (via project_companies) and reuses getProjectDashboard's
 * per-section, permission-gated aggregation unchanged rather than
 * re-deriving it. A project the caller isn't a member of (loadPermissionContext
 * throws NotFoundError) is silently skipped, same "omit, don't 403" spirit
 * as getProjectDashboard's own per-section gating -- a company can have
 * projects this particular user isn't staffed on.
 */
export async function getCompanyDashboard(appDb: Database, userId: string, companyId: string): Promise<CompanyProjectDashboard[]> {
  const projects = await withRequestContext(appDb, { userId }, async (tx) => {
    const isMember = await tx.select().from(schema.userCompanies).where(and(eq(schema.userCompanies.userId, userId), eq(schema.userCompanies.companyId, companyId))).limit(1);
    if (isMember.length === 0) throw new ApiError(403, "not_company_member", "You are not a member of this company");

    return tx
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projectCompanies)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.projectCompanies.projectId))
      .where(eq(schema.projectCompanies.companyId, companyId));
  });

  const results: CompanyProjectDashboard[] = [];
  for (const project of projects) {
    try {
      const ctx = await loadPermissionContext(appDb, userId, project.id);
      const dashboard = await getProjectDashboard(appDb, userId, ctx, project.id);
      results.push({ projectId: project.id, projectName: project.name, dashboard });
    } catch {
      // Not a member of this particular project -- omit it, same as a
      // single project dashboard omitting a section the caller can't see.
    }
  }
  return results;
}
