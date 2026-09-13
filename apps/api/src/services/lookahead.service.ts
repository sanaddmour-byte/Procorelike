import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  computePpc,
  filterLookaheadWindow,
  requirePermission,
  type CompanyPpc,
  type CreateLookaheadCommitmentInput,
  type CreateLookaheadPlanInput,
  type CreateScheduleConstraintInput,
  type PermissionContext,
  type RecordCommitmentActualInput,
} from "@siteops/shared";
import { and, eq, inArray } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { getCurrentScheduleWithTasks } from "./cpm-schedule.service";

type ScheduleConstraintRow = typeof schema.scheduleConstraints.$inferSelect;
type LookaheadPlanRow = typeof schema.lookaheadPlans.$inferSelect;
type LookaheadCommitmentRow = typeof schema.lookaheadCommitments.$inferSelect;

export interface CompanyName {
  companyId: string;
  name: string;
}

/**
 * `GET /projects/:id/companies` (Phase 6) is gated on financial-module
 * read access, which a foreman/superintendent legitimately doesn't have
 * -- but they still need to see whose commitment/constraint they're
 * looking at on a look-ahead. This is the same data at "schedule":"read"
 * instead, so this phase's screens don't inherit a financial-only gate
 * for a non-financial purpose.
 */
export async function listProjectCompanyNames(appDb: Database, userId: string, ctx: PermissionContext, projectId: string): Promise<CompanyName[]> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx
      .select({ companyId: schema.companies.id, name: schema.companies.name })
      .from(schema.projectCompanies)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.projectCompanies.companyId))
      .where(eq(schema.projectCompanies.projectId, projectId));
  });
}

// -- Constraint log --

export async function createScheduleConstraint(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateScheduleConstraintInput,
): Promise<ScheduleConstraintRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.insert(schema.scheduleConstraints).values({ ...input, createdBy: userId }).returning();
    if (!row) throw new Error("Failed to create schedule constraint");
    return row;
  });
}

export async function listScheduleConstraintsForTask(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  taskId: string,
): Promise<ScheduleConstraintRow[]> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.scheduleConstraints).where(eq(schema.scheduleConstraints.taskId, taskId));
  });
}

/**
 * Constraints attach to a specific version's task rows, so this only ever
 * lists the *current* version's constraints -- unlike record_links, a
 * re-import does not carry a constraint forward onto the new version's
 * matching task (documented scope cut for this phase; the mechanism
 * would mirror importSchedule()'s record_links carry-forward exactly, but
 * wasn't needed to hit this phase's gate).
 */
export async function listScheduleConstraintsForProject(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<ScheduleConstraintRow[]> {
  const current = await getCurrentScheduleWithTasks(appDb, userId, ctx, projectId);
  if (!current || current.tasks.length === 0) return [];
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx
      .select()
      .from(schema.scheduleConstraints)
      .where(
        inArray(
          schema.scheduleConstraints.taskId,
          current.tasks.map((t) => t.id),
        ),
      );
  });
}

export async function clearScheduleConstraint(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  constraintId: string,
): Promise<ScheduleConstraintRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .update(schema.scheduleConstraints)
      .set({ status: "cleared", clearedAt: new Date(), clearedBy: userId, updatedAt: new Date() })
      .where(eq(schema.scheduleConstraints.id, constraintId))
      .returning();
    if (!row) throw new NotFoundError("Schedule constraint not found");
    return row;
  });
}

export async function findConstraintProjectId(appDb: Database, userId: string, constraintId: string): Promise<string | undefined> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [row] = await tx
      .select({ projectId: schema.schedules.projectId })
      .from(schema.scheduleConstraints)
      .innerJoin(schema.cpmScheduleTasks, eq(schema.cpmScheduleTasks.id, schema.scheduleConstraints.taskId))
      .innerJoin(schema.scheduleVersions, eq(schema.scheduleVersions.id, schema.cpmScheduleTasks.versionId))
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.scheduleVersions.scheduleId))
      .where(eq(schema.scheduleConstraints.id, constraintId))
      .limit(1);
    return row?.projectId;
  });
}

// -- Look-ahead plans + view --

export interface LookaheadViewGroup {
  companyId: string | null;
  taskIds: string[];
}

export interface LookaheadView {
  weekStart: string;
  horizonWeeks: number;
  taskIds: string[];
  groupedByCompany: LookaheadViewGroup[];
}

/** Ad-hoc, unsaved: viewing a look-ahead window doesn't require a published plan. */
export async function getLookaheadView(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  weekStart: string,
  horizonWeeks: number,
): Promise<LookaheadView> {
  const current = await getCurrentScheduleWithTasks(appDb, userId, ctx, projectId);
  const tasks = (current?.tasks ?? []).map((t) => ({
    id: t.id,
    responsibleCompanyId: t.responsibleCompanyId,
    plannedStart: t.plannedStart?.toISOString() ?? null,
    plannedFinish: t.plannedFinish?.toISOString() ?? null,
    earlyStart: t.earlyStart?.toISOString() ?? null,
    earlyFinish: t.earlyFinish?.toISOString() ?? null,
  }));
  const inWindow = filterLookaheadWindow(tasks, { weekStart, horizonWeeks });

  const byCompany = new Map<string | null, string[]>();
  for (const task of inWindow) {
    const key = task.responsibleCompanyId;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(task.id);
  }

  return {
    weekStart,
    horizonWeeks,
    taskIds: inWindow.map((t) => t.id),
    groupedByCompany: [...byCompany.entries()].map(([companyId, taskIds]) => ({ companyId, taskIds })),
  };
}

/** Publishing and creating a plan are the same action this phase -- no separate draft state (documented simplification). */
export async function createLookaheadPlan(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateLookaheadPlanInput,
): Promise<LookaheadPlanRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.lookaheadPlans)
      .values({ ...input, createdBy: userId, publishedAt: new Date(), publishedBy: userId })
      .returning();
    if (!row) throw new Error("Failed to create look-ahead plan");
    return row;
  });
}

export async function listLookaheadPlans(appDb: Database, userId: string, ctx: PermissionContext, projectId: string): Promise<LookaheadPlanRow[]> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.lookaheadPlans).where(eq(schema.lookaheadPlans.projectId, projectId));
  });
}

export async function findLookaheadPlanProjectId(appDb: Database, userId: string, planId: string): Promise<string | undefined> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [row] = await tx.select().from(schema.lookaheadPlans).where(eq(schema.lookaheadPlans.id, planId)).limit(1);
    return row?.projectId;
  });
}

// -- Commitments + PPC (Last Planner) --

export async function createLookaheadCommitment(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateLookaheadCommitmentInput,
): Promise<LookaheadCommitmentRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.insert(schema.lookaheadCommitments).values(input).returning();
    if (!row) throw new Error("Failed to create commitment");
    return row;
  });
}

export async function listCommitmentsForPlan(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  planId: string,
): Promise<LookaheadCommitmentRow[]> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.lookaheadCommitments).where(eq(schema.lookaheadCommitments.lookaheadPlanId, planId));
  });
}

/**
 * Confirm/decline (mobile A7) only requires "read" on schedule -- it's
 * self-scoped to the caller's own company (checked below), the same
 * reasoning as accepting a progress-update submission: a narrow, safe
 * action doesn't need the broader "standard" edit level.
 */
export async function setCommitmentConfirmation(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  commitmentId: string,
  action: "confirmed" | "declined",
): Promise<LookaheadCommitmentRow> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [commitment] = await tx.select().from(schema.lookaheadCommitments).where(eq(schema.lookaheadCommitments.id, commitmentId)).limit(1);
    if (!commitment) throw new NotFoundError("Commitment not found");

    const [membership] = await tx
      .select()
      .from(schema.projectUsers)
      .where(and(eq(schema.projectUsers.projectId, projectId), eq(schema.projectUsers.userId, userId)))
      .limit(1);
    if (!membership || membership.companyId !== commitment.committedByCompanyId) {
      throw new ApiError(403, "not_committed_company", "You are not a member of the company this commitment was made for");
    }

    const [row] = await tx.update(schema.lookaheadCommitments).set({ status: action }).where(eq(schema.lookaheadCommitments.id, commitmentId)).returning();
    if (!row) throw new NotFoundError("Commitment not found");
    return row;
  });
}

export async function recordCommitmentActual(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  commitmentId: string,
  input: RecordCommitmentActualInput,
): Promise<LookaheadCommitmentRow> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .update(schema.lookaheadCommitments)
      .set({ actualFinish: input.actualFinish, reasonCode: input.reasonCode })
      .where(eq(schema.lookaheadCommitments.id, commitmentId))
      .returning();
    if (!row) throw new NotFoundError("Commitment not found");
    return row;
  });
}

export async function getPpcForPlan(appDb: Database, userId: string, ctx: PermissionContext, planId: string): Promise<CompanyPpc[]> {
  const commitments = await listCommitmentsForPlan(appDb, userId, ctx, planId);
  const asOfDate = new Date().toISOString().slice(0, 10);
  return computePpc(commitments, asOfDate);
}

export async function findCommitmentProjectId(appDb: Database, userId: string, commitmentId: string): Promise<string | undefined> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [row] = await tx
      .select({ projectId: schema.lookaheadPlans.projectId })
      .from(schema.lookaheadCommitments)
      .innerJoin(schema.lookaheadPlans, eq(schema.lookaheadPlans.id, schema.lookaheadCommitments.lookaheadPlanId))
      .where(eq(schema.lookaheadCommitments.id, commitmentId))
      .limit(1);
    return row?.projectId;
  });
}

// -- Delay register (Addendum A6 "delay linkage") --

export interface DelayRegisterEntry {
  taskId: string;
  taskName: string;
  totalHoursImpact: number;
  entryCount: number;
}

/** Cumulative hours-impact per task, from every daily-log delay entry linked to a current-version task. Days = hours / calendar hoursPerDay is left to the UI, which already knows the task's calendar. */
export async function getDelayRegister(appDb: Database, userId: string, ctx: PermissionContext, projectId: string): Promise<DelayRegisterEntry[]> {
  const current = await getCurrentScheduleWithTasks(appDb, userId, ctx, projectId);
  if (!current || current.tasks.length === 0) return [];
  const taskIds = current.tasks.map((t) => t.id);
  const taskNameById = new Map(current.tasks.map((t) => [t.id, t.name]));

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx
      .select({ scheduleTaskId: schema.dailyLogDelays.scheduleTaskId, hoursImpact: schema.dailyLogDelays.hoursImpact })
      .from(schema.dailyLogDelays)
      .where(inArray(schema.dailyLogDelays.scheduleTaskId, taskIds));

    const byTask = new Map<string, DelayRegisterEntry>();
    for (const row of rows) {
      if (!row.scheduleTaskId) continue;
      let entry = byTask.get(row.scheduleTaskId);
      if (!entry) {
        entry = { taskId: row.scheduleTaskId, taskName: taskNameById.get(row.scheduleTaskId) ?? "", totalHoursImpact: 0, entryCount: 0 };
        byTask.set(row.scheduleTaskId, entry);
      }
      entry.totalHoursImpact += row.hoursImpact ? Number(row.hoursImpact) : 0;
      entry.entryCount += 1;
    }
    return [...byTask.values()];
  });
}
