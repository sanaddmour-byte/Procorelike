import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  diffScheduleVersions,
  parseCsvSchedule,
  parseMsProjectXml,
  parseP6Xer,
  parseP6Xml,
  requirePermission,
  type ParsedSchedule,
  type PermissionContext,
  type ScheduleDiff,
  type ScheduleSourceTool,
} from "@siteops/shared";
import { eq, inArray } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type ScheduleRow = typeof schema.schedules.$inferSelect;
type ScheduleVersionRow = typeof schema.scheduleVersions.$inferSelect;
type CpmScheduleTaskRow = typeof schema.cpmScheduleTasks.$inferSelect;

export interface ImportScheduleInput {
  projectId: string;
  sourceTool: ScheduleSourceTool;
  fileText: string;
  /** Only meaningful for sourceTool "csv" -- see CsvColumnMapping in @siteops/shared. */
  columnMapping?: Record<string, string>;
}

export interface ImportScheduleResult {
  schedule: ScheduleRow;
  version: ScheduleVersionRow;
  taskCount: number;
  /** undefined for a project's very first import -- there's nothing to diff against. */
  diff?: ScheduleDiff;
}

/** Postgres caps bound parameters at 65,534 per query -- a single bulk INSERT of a large schedule's tasks (20+ columns each) blows past that well before docs/SCHEDULING.md A2's 5,000-task bar, so every bulk insert here goes through this in batches instead. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function parseByTool(input: ImportScheduleInput): ParsedSchedule {
  switch (input.sourceTool) {
    case "csv":
      return parseCsvSchedule(input.fileText, { dataDate: new Date().toISOString().slice(0, 10), columnMapping: input.columnMapping });
    case "ms_project_xml":
      return parseMsProjectXml(input.fileText);
    case "p6_xer":
      return parseP6Xer(input.fileText);
    case "p6_xml":
      return parseP6Xml(input.fileText);
    default:
      throw new ApiError(400, "validation_error", `Unsupported sourceTool: ${input.sourceTool}`);
  }
}

/**
 * Imports a schedule file, creating a new immutable version (never
 * overwriting a prior one -- docs/SCHEDULING.md A2). On a re-import,
 * diffs against the project's current version and carries forward any
 * record_links pointing at a matched task's *previous* version row onto
 * its new row, so "an RFI linked to this activity" survives the import
 * instead of dangling on a now-superseded task id.
 *
 * Scope cut: processed synchronously, not as a background job with
 * progress feedback (docs/SCHEDULING.md A2's "5,000-task file in under
 * 10 seconds ... never a blocking request" is aimed at that scale; at
 * the ~1,000-task scale this phase's gate targets, synchronous import
 * comfortably clears the 10s bar in practice -- see the Phase 11a gate
 * report for the measured time). A background-job version is a
 * reasonable follow-up once real usage approaches thousands of tasks.
 */
export async function importSchedule(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: ImportScheduleInput,
): Promise<ImportScheduleResult> {
  requirePermission(ctx, "schedule", "standard");
  const parsed = parseByTool(input);

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    let [scheduleRow] = await tx.select().from(schema.schedules).where(eq(schema.schedules.projectId, input.projectId)).limit(1);
    if (!scheduleRow) {
      const [created] = await tx
        .insert(schema.schedules)
        .values({ projectId: input.projectId, sourceTool: input.sourceTool, createdBy: userId })
        .returning();
      if (!created) throw new Error("Failed to create schedule");
      scheduleRow = created;
    }

    const previousVersionId = scheduleRow.currentVersionId;
    let diff: ScheduleDiff | undefined;
    let previousTaskById = new Map<string, CpmScheduleTaskRow>();

    if (previousVersionId) {
      const previousTasks = await tx
        .select()
        .from(schema.cpmScheduleTasks)
        .where(eq(schema.cpmScheduleTasks.versionId, previousVersionId));
      previousTaskById = new Map(previousTasks.map((t) => [t.id, t]));

      const previousDeps = await tx
        .select()
        .from(schema.taskDependencies)
        .where(
          inArray(
            schema.taskDependencies.successorId,
            previousTasks.map((t) => t.id),
          ),
        );
      const predecessorExternalIdsBySuccessor = new Map<string, string[]>();
      for (const dep of previousDeps) {
        const predTask = previousTaskById.get(dep.predecessorId);
        const succTask = previousTaskById.get(dep.successorId);
        if (!predTask?.externalId || !succTask?.externalId) continue;
        if (!predecessorExternalIdsBySuccessor.has(succTask.externalId)) predecessorExternalIdsBySuccessor.set(succTask.externalId, []);
        predecessorExternalIdsBySuccessor.get(succTask.externalId)!.push(predTask.externalId);
      }

      diff = diffScheduleVersions(
        previousTasks
          .filter((t) => t.externalId)
          .map((t) => ({
            externalId: t.externalId!,
            wbsCode: t.wbsCode,
            name: t.name,
            plannedStart: t.plannedStart ? t.plannedStart.toISOString() : undefined,
            percentComplete: t.percentComplete,
            predecessorExternalIds: predecessorExternalIdsBySuccessor.get(t.externalId!) ?? [],
          })),
        parsed,
      );
    }

    const nextVersionNo = previousVersionId
      ? ((await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.scheduleId, scheduleRow.id))).length + 1)
      : 1;

    const [version] = await tx
      .insert(schema.scheduleVersions)
      .values({
        scheduleId: scheduleRow.id,
        versionNo: nextVersionNo,
        dataDate: parsed.dataDate,
        importedFrom: input.sourceTool,
        importedBy: userId,
        notes: parsed.warnings.length > 0 ? `Import warnings: ${parsed.warnings.join("; ")}` : undefined,
      })
      .returning();
    if (!version) throw new Error("Failed to create schedule version");

    const calendarIdByExternalId = new Map<string, string>();
    for (const cal of parsed.calendars) {
      const [row] = await tx
        .insert(schema.calendars)
        .values({
          projectId: input.projectId,
          name: cal.name,
          isDefault: cal.isDefault,
          hoursPerDay: cal.hoursPerDay.toString(),
          workingDays: cal.workingDays,
        })
        .returning();
      if (row) calendarIdByExternalId.set(cal.externalId, row.id);
    }

    const taskValues = parsed.tasks.map((t) => ({
      versionId: version.id,
      externalId: t.externalId,
      wbsCode: t.wbsCode,
      name: t.name,
      taskType: t.taskType,
      durationMinutes: t.durationMinutes,
      calendarId: t.calendarExternalId ? calendarIdByExternalId.get(t.calendarExternalId) : undefined,
      earlyStart: t.earlyStart ? new Date(t.earlyStart) : undefined,
      earlyFinish: t.earlyFinish ? new Date(t.earlyFinish) : undefined,
      lateStart: t.lateStart ? new Date(t.lateStart) : undefined,
      lateFinish: t.lateFinish ? new Date(t.lateFinish) : undefined,
      plannedStart: t.plannedStart ? new Date(t.plannedStart) : undefined,
      plannedFinish: t.plannedFinish ? new Date(t.plannedFinish) : undefined,
      actualStart: t.actualStart ? new Date(t.actualStart) : undefined,
      actualFinish: t.actualFinish ? new Date(t.actualFinish) : undefined,
      totalFloatMinutes: t.totalFloatMinutes,
      freeFloatMinutes: t.freeFloatMinutes,
      isCritical: t.isCritical ?? false,
      percentComplete: t.percentComplete,
      physicalPercentComplete: t.physicalPercentComplete,
      constraintType: t.constraintType,
      constraintDate: t.constraintDate ? new Date(t.constraintDate) : undefined,
      sortOrder: t.sortOrder,
    }));

    const insertedTasks: CpmScheduleTaskRow[] = [];
    for (const batch of chunk(taskValues, 1000)) {
      insertedTasks.push(...(await tx.insert(schema.cpmScheduleTasks).values(batch).returning()));
    }

    // parentTaskId is a self-reference resolved in a second pass, once every task has a real row id.
    const idByExternalId = new Map(insertedTasks.filter((t) => t.externalId).map((t) => [t.externalId!, t.id]));
    for (const t of parsed.tasks) {
      if (!t.parentExternalId) continue;
      const childId = idByExternalId.get(t.externalId);
      const parentId = idByExternalId.get(t.parentExternalId);
      if (childId && parentId) {
        await tx.update(schema.cpmScheduleTasks).set({ parentTaskId: parentId }).where(eq(schema.cpmScheduleTasks.id, childId));
      }
    }

    if (parsed.dependencies.length > 0) {
      const depValues = parsed.dependencies
        .map((d) => ({
          predecessorId: idByExternalId.get(d.predecessorExternalId),
          successorId: idByExternalId.get(d.successorExternalId),
          type: d.type,
          lagMinutes: d.lagMinutes,
        }))
        .filter((d): d is { predecessorId: string; successorId: string; type: (typeof parsed.dependencies)[number]["type"]; lagMinutes: number } =>
          Boolean(d.predecessorId && d.successorId),
        );
      for (const batch of chunk(depValues, 1000)) {
        await tx.insert(schema.taskDependencies).values(batch);
      }
    }

    // Carry forward record_links: a link pointing at a previous-version task
    // whose externalId matches a task in this new version gets repointed at
    // the new row, so it keeps resolving to "the same activity," current data.
    if (previousTaskById.size > 0) {
      const existingLinks = await tx
        .select()
        .from(schema.recordLinks)
        .where(
          inArray(
            schema.recordLinks.targetId,
            [...previousTaskById.keys()],
          ),
        );
      for (const link of existingLinks) {
        if (link.targetType !== "schedule_task") continue;
        const previousTask = previousTaskById.get(link.targetId);
        const newTaskId = previousTask?.externalId ? idByExternalId.get(previousTask.externalId) : undefined;
        if (newTaskId) {
          await tx.update(schema.recordLinks).set({ targetId: newTaskId }).where(eq(schema.recordLinks.id, link.id));
        }
      }
    }

    await tx.update(schema.schedules).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(schema.schedules.id, scheduleRow.id));

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "schedule_version",
      entityId: version.id,
      action: "import",
      after: { versionNo: version.versionNo, taskCount: insertedTasks.length },
    });

    return { schedule: { ...scheduleRow, currentVersionId: version.id }, version, taskCount: insertedTasks.length, diff };
  });
}

export async function findScheduleByProjectId(appDb: Database, userId: string, projectId: string): Promise<ScheduleRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.schedules).where(eq(schema.schedules.projectId, projectId)).limit(1);
    return row;
  });
}

export async function getScheduleForProject(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<{ schedule: ScheduleRow; versions: ScheduleVersionRow[] } | undefined> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [scheduleRow] = await tx.select().from(schema.schedules).where(eq(schema.schedules.projectId, projectId)).limit(1);
    if (!scheduleRow) return undefined;
    const versions = await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.scheduleId, scheduleRow.id));
    return { schedule: scheduleRow, versions };
  });
}

export interface CurrentScheduleWithTasks {
  schedule: ScheduleRow;
  version: ScheduleVersionRow;
  tasks: CpmScheduleTaskRow[];
  dependencies: (typeof schema.taskDependencies.$inferSelect)[];
  calendars: (typeof schema.calendars.$inferSelect)[];
}

/** One-call convenience for a Gantt view: the project's current version plus every task/dependency/calendar it needs, instead of two round trips. */
export async function getCurrentScheduleWithTasks(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<CurrentScheduleWithTasks | undefined> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [scheduleRow] = await tx.select().from(schema.schedules).where(eq(schema.schedules.projectId, projectId)).limit(1);
    if (!scheduleRow || !scheduleRow.currentVersionId) return undefined;
    const [version] = await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, scheduleRow.currentVersionId)).limit(1);
    if (!version) return undefined;

    const tasks = await tx.select().from(schema.cpmScheduleTasks).where(eq(schema.cpmScheduleTasks.versionId, version.id));
    const dependencies =
      tasks.length > 0
        ? await tx
            .select()
            .from(schema.taskDependencies)
            .where(
              inArray(
                schema.taskDependencies.successorId,
                tasks.map((t) => t.id),
              ),
            )
        : [];
    const calendars = await tx.select().from(schema.calendars).where(eq(schema.calendars.projectId, projectId));

    return { schedule: scheduleRow, version, tasks, dependencies, calendars };
  });
}

export async function listVersionTasks(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  versionId: string,
): Promise<{ tasks: CpmScheduleTaskRow[]; dependencies: (typeof schema.taskDependencies.$inferSelect)[] }> {
  requirePermission(ctx, "schedule", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx: Tx) => {
    const tasks = await tx.select().from(schema.cpmScheduleTasks).where(eq(schema.cpmScheduleTasks.versionId, versionId));
    if (tasks.length === 0) return { tasks: [], dependencies: [] };
    const dependencies = await tx
      .select()
      .from(schema.taskDependencies)
      .where(
        inArray(
          schema.taskDependencies.successorId,
          tasks.map((t) => t.id),
        ),
      );
    return { tasks, dependencies };
  });
}

/** Peek used by routes to resolve which project a version belongs to. */
export async function findVersionById(appDb: Database, userId: string, versionId: string): Promise<ScheduleVersionRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, versionId)).limit(1);
    return row;
  });
}

export async function findScheduleProjectId(appDb: Database, userId: string, scheduleId: string): Promise<string | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.schedules).where(eq(schema.schedules.id, scheduleId)).limit(1);
    return row?.projectId;
  });
}

export async function findVersionProjectId(appDb: Database, userId: string, versionId: string): Promise<string | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [version] = await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, versionId)).limit(1);
    if (!version) return undefined;
    const [scheduleRow] = await tx.select().from(schema.schedules).where(eq(schema.schedules.id, version.scheduleId)).limit(1);
    return scheduleRow?.projectId;
  });
}

/** Used by Phase 11c's constraint/progress-update routes to resolve a projectId from a bare taskId query param. */
export async function findTaskProjectId(appDb: Database, userId: string, taskId: string): Promise<string | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [task] = await tx.select().from(schema.cpmScheduleTasks).where(eq(schema.cpmScheduleTasks.id, taskId)).limit(1);
    if (!task) return undefined;
    const [version] = await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, task.versionId)).limit(1);
    if (!version) return undefined;
    const [scheduleRow] = await tx.select().from(schema.schedules).where(eq(schema.schedules.id, version.scheduleId)).limit(1);
    return scheduleRow?.projectId;
  });
}

/** Throws NotFoundError if the project has no schedule imported yet. */
export function requireSchedule<T>(value: T | undefined): T {
  if (!value) throw new NotFoundError("No schedule found for this project");
  return value;
}
