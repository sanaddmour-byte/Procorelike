import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type PermissionContext } from "@siteops/shared";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { ApiError } from "../lib/errors";

export interface LocationNode {
  id: string;
  parentId: string | null;
  levelType: "building" | "level" | "zone" | "room";
  name: string;
  /** "Tower A › Level 1 › Zone B" -- the whole chain, so a flat picker can show and search by it. */
  path: string;
}

/** Every location in a project with its computed path (plan E1). Any project member may read: locations are reference data used by many modules. */
export async function listLocations(appDb: Database, userId: string, ctx: PermissionContext, projectId: string): Promise<LocationNode[]> {
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx.select().from(schema.locations).where(eq(schema.locations.projectId, projectId)).orderBy(asc(schema.locations.name));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const pathOf = (id: string, guard = 0): string[] => {
      const r = byId.get(id);
      if (!r || guard > 8) return [];
      return [...(r.parentId ? pathOf(r.parentId, guard + 1) : []), r.name];
    };
    return rows
      .map((r) => ({ id: r.id, parentId: r.parentId, levelType: r.levelType, name: r.name, path: pathOf(r.id).join(" › ") }))
      .sort((a, b) => a.path.localeCompare(b.path));
  });
}

const CHILD_OF: Record<string, "level" | "zone" | "room"> = { building: "level", level: "zone", zone: "room" };

/** Adds a location on the fly (e.g. "Unit 402") so a snag never waits on an admin. Child level type is derived from the parent's. */
export async function createLocation(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  input: { name: string; parentId?: string | null },
): Promise<LocationNode> {
  requirePermission(ctx, "punch_list", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    let levelType: "building" | "level" | "zone" | "room" = "building";
    if (input.parentId) {
      const [parent] = await tx
        .select()
        .from(schema.locations)
        .where(and(eq(schema.locations.id, input.parentId), eq(schema.locations.projectId, projectId)))
        .limit(1);
      if (!parent) throw new ApiError(400, "invalid_parent", "Parent location not found in this project");
      levelType = CHILD_OF[parent.levelType] ?? "room";
    }
    const [row] = await tx.insert(schema.locations).values({ projectId, parentId: input.parentId ?? null, levelType, name: input.name.trim() }).returning();
    if (!row) throw new Error("location insert failed");
    return { id: row.id, parentId: row.parentId, levelType: row.levelType, name: row.name, path: row.name };
  });
}

export async function listTrades(appDb: Database, userId: string): Promise<{ id: string; name: string }[]> {
  return withRequestContext(appDb, { userId }, async (tx) => tx.select({ id: schema.trades.id, name: schema.trades.name }).from(schema.trades).orderBy(asc(schema.trades.name)));
}

export type MyWorkModule = "punch_list" | "rfis" | "submittals" | "corrective_actions";
export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export interface MyWorkItem {
  module: MyWorkModule;
  /** URL segment under /projects/:id/ */
  segment: string;
  id: string;
  number: string | null;
  title: string;
  status: string;
  dueDate: string | null;
  dueBucket: DueBucket;
}

export function dueBucketOf(due: Date | null, now: Date = new Date()): DueBucket {
  if (!due) return "none";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 3600 * 1000;
  const t = due.getTime();
  if (t < startOfToday) return "overdue";
  if (t < startOfToday + day) return "today";
  if (t < startOfToday + 8 * day) return "week";
  return "later";
}

/** Everything the caller owns right now across modules, grouped by due bucket in the client (plan E5, D1 task 7). */
export async function getMyWork(appDb: Database, userId: string, ctx: PermissionContext, projectId: string): Promise<MyWorkItem[]> {
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const out: MyWorkItem[] = [];
    const now = new Date();
    const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

    const punch = await tx
      .select()
      .from(schema.punchItems)
      .where(and(eq(schema.punchItems.projectId, projectId), isNull(schema.punchItems.deletedAt), ne(schema.punchItems.status, "closed")));
    for (const p of punch) {
      const mineAsAssignee = p.assigneeUserId === userId;
      const mineAsApprover = p.finalApproverUserId === userId && (p.status === "ready_for_review" || p.status === "approved");
      if (!mineAsAssignee && !mineAsApprover) continue;
      out.push({ module: "punch_list", segment: "punch-list", id: p.id, number: p.number, title: p.description, status: p.status, dueDate: iso(p.dueDate), dueBucket: dueBucketOf(p.dueDate, now) });
    }

    const rfis = await tx
      .select()
      .from(schema.rfis)
      .where(and(eq(schema.rfis.projectId, projectId), eq(schema.rfis.ballInCourtUserId, userId), eq(schema.rfis.status, "open"), isNull(schema.rfis.deletedAt)));
    for (const r of rfis) out.push({ module: "rfis", segment: "rfis", id: r.id, number: r.number, title: r.subject, status: r.status, dueDate: iso(r.dueDate), dueBucket: dueBucketOf(r.dueDate, now) });

    const subs = await tx
      .select()
      .from(schema.submittals)
      .where(and(eq(schema.submittals.projectId, projectId), eq(schema.submittals.ballInCourtUserId, userId), inArray(schema.submittals.status, ["draft", "in_review"])));
    for (const s of subs) out.push({ module: "submittals", segment: "submittals", id: s.id, number: s.number, title: s.title, status: s.status, dueDate: iso(s.dueDate), dueBucket: dueBucketOf(s.dueDate, now) });

    const cas = await tx
      .select()
      .from(schema.correctiveActions)
      .where(and(eq(schema.correctiveActions.projectId, projectId), eq(schema.correctiveActions.assignedToUserId, userId), inArray(schema.correctiveActions.status, ["open", "in_progress"])));
    for (const c of cas) out.push({ module: "corrective_actions", segment: "safety", id: c.id, number: null, title: c.description, status: c.status, dueDate: iso(c.dueDate), dueBucket: dueBucketOf(c.dueDate, now) });

    const order: Record<DueBucket, number> = { overdue: 0, today: 1, week: 2, later: 3, none: 4 };
    return out.sort((a, b) => order[a.dueBucket] - order[b.dueBucket] || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  });
}
