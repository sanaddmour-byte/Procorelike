import { schema, withRequestContext, type Database } from "@siteops/db";
import { hasPermission, type PermissionContext } from "@siteops/shared";
import { and, eq, ilike, or } from "drizzle-orm";

export type SearchResultType = "project" | "company" | "rfi" | "submittal" | "document" | "drawing" | "daily_log" | "schedule_task" | "person";

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string;
  /** Relative app path (no locale prefix -- the caller prepends `/${locale}`). */
  path: string;
}

const RESULTS_PER_CATEGORY = 5;

/**
 * Real cross-entity search, not a mock: every category is a genuine
 * ILIKE query against RLS-scoped tables, gated the same way
 * dashboard.service.ts gates its per-section rollups -- a category is
 * simply omitted if the caller can't read that module, never a 403 for
 * the whole search. Projects and Companies are always included (no
 * module permission governs seeing your own project/company list);
 * everything else requires `projectId` + the caller's PermissionContext
 * for that project, since RFIs/Submittals/Documents/Drawings/Daily
 * Logs/Schedule/People are all project-scoped.
 */
export async function globalSearch(
  appDb: Database,
  userId: string,
  query: string,
  projectId: string | undefined,
  ctx: PermissionContext | undefined,
): Promise<SearchResultItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q}%`;

  return withRequestContext(appDb, { userId }, async (tx) => {
    const results: SearchResultItem[] = [];

    const projects = await tx.select().from(schema.projects).where(ilike(schema.projects.name, pattern)).limit(RESULTS_PER_CATEGORY);
    results.push(...projects.map((p) => ({ type: "project" as const, id: p.id, title: p.name, path: `/projects/${p.id}/dashboard` })));

    const companies = await tx.select().from(schema.companies).where(ilike(schema.companies.name, pattern)).limit(RESULTS_PER_CATEGORY);
    results.push(...companies.map((c) => ({ type: "company" as const, id: c.id, title: c.name, subtitle: c.type, path: `/companies` })));

    if (!projectId || !ctx) return results;

    if (hasPermission(ctx, "rfis", "read")) {
      const rows = await tx
        .select()
        .from(schema.rfis)
        .where(and(eq(schema.rfis.projectId, projectId), or(ilike(schema.rfis.subject, pattern), ilike(schema.rfis.number, pattern))))
        .limit(RESULTS_PER_CATEGORY);
      results.push(...rows.map((r) => ({ type: "rfi" as const, id: r.id, title: `${r.number} — ${r.subject}`, path: `/projects/${projectId}/rfis/${r.id}` })));
    }

    if (hasPermission(ctx, "submittals", "read")) {
      const rows = await tx
        .select()
        .from(schema.submittals)
        .where(and(eq(schema.submittals.projectId, projectId), or(ilike(schema.submittals.title, pattern), ilike(schema.submittals.number, pattern))))
        .limit(RESULTS_PER_CATEGORY);
      results.push(...rows.map((r) => ({ type: "submittal" as const, id: r.id, title: `${r.number} — ${r.title}`, path: `/projects/${projectId}/submittals/${r.id}` })));
    }

    if (hasPermission(ctx, "documents", "read")) {
      const rows = await tx
        .select()
        .from(schema.documents)
        .where(and(eq(schema.documents.projectId, projectId), ilike(schema.documents.title, pattern)))
        .limit(RESULTS_PER_CATEGORY);
      results.push(...rows.map((r) => ({ type: "document" as const, id: r.id, title: r.title, path: `/projects/${projectId}/documents` })));
    }

    if (hasPermission(ctx, "drawings", "read")) {
      const rows = await tx
        .select()
        .from(schema.drawings)
        .where(and(eq(schema.drawings.projectId, projectId), or(ilike(schema.drawings.title, pattern), ilike(schema.drawings.sheetNumber, pattern))))
        .limit(RESULTS_PER_CATEGORY);
      results.push(...rows.map((r) => ({ type: "drawing" as const, id: r.id, title: `${r.sheetNumber} — ${r.title}`, path: `/projects/${projectId}/drawings/${r.id}` })));
    }

    if (hasPermission(ctx, "daily_log", "read")) {
      const rows = await tx
        .select()
        .from(schema.dailyLogs)
        .where(and(eq(schema.dailyLogs.projectId, projectId), ilike(schema.dailyLogs.notes, pattern)))
        .limit(RESULTS_PER_CATEGORY);
      results.push(
        ...rows.map((r) => ({
          type: "daily_log" as const,
          id: r.id,
          title: `Daily Log — ${r.logDate.toISOString().slice(0, 10)}`,
          subtitle: r.notes?.slice(0, 80),
          path: `/projects/${projectId}/daily-log/${r.id}`,
        })),
      );
    }

    if (hasPermission(ctx, "schedule", "read")) {
      const rows = await tx
        .select()
        .from(schema.scheduleTasks)
        .where(and(eq(schema.scheduleTasks.projectId, projectId), ilike(schema.scheduleTasks.name, pattern)))
        .limit(RESULTS_PER_CATEGORY);
      results.push(...rows.map((r) => ({ type: "schedule_task" as const, id: r.id, title: r.name, path: `/projects/${projectId}/schedule/${r.id}` })));
    }

    const people = await tx
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
      .from(schema.projectUsers)
      .innerJoin(schema.users, eq(schema.users.id, schema.projectUsers.userId))
      .where(and(eq(schema.projectUsers.projectId, projectId), or(ilike(schema.users.name, pattern), ilike(schema.users.email, pattern))))
      .limit(RESULTS_PER_CATEGORY);
    results.push(...people.map((p) => ({ type: "person" as const, id: p.id, title: p.name, subtitle: p.email, path: `/projects/${projectId}/directory` })));

    return results;
  });
}
