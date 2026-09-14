import { schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  buildMsProjectXml,
  computeSchedule,
  requirePermission,
  type CpmCalendar,
  type CpmDependency,
  type CpmOptions,
  type CpmResult,
  type CpmTask,
  type PermissionContext,
  type ScheduleEditBatchInput,
} from "@siteops/shared";
import { eq, inArray } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

/**
 * Phase 11d / Tier B (docs/SCHEDULING.md): native CPM editing, gated behind
 * `schedules.nativeEditingEnabled` per project. Tier A's import flow
 * (cpm-schedule.service.ts) never mutates a version's tasks in place; this
 * file is the one place that does, and only when the flag is on.
 */

type ScheduleRow = typeof schema.schedules.$inferSelect;
type ScheduleVersionRow = typeof schema.scheduleVersions.$inferSelect;
type CpmScheduleTaskRow = typeof schema.cpmScheduleTasks.$inferSelect;
type TaskDependencyRow = typeof schema.taskDependencies.$inferSelect;
type CalendarRow = typeof schema.calendars.$inferSelect;

const DEFAULT_CPM_OPTIONS: CpmOptions = {
  retainedLogic: true,
  ignoreConstraintsOnCritical: false,
  criticalFloatThresholdMinutes: 0,
};

export class ScheduleEditNotEnabledError extends ApiError {
  constructor() {
    super(409, "native_editing_disabled", "Native schedule editing is not enabled for this project's schedule");
  }
}

export class DependencyCycleError extends ApiError {
  constructor(taskIds: string[]) {
    super(409, "dependency_cycle", `This change would create a dependency cycle involving: ${taskIds.join(", ")}`);
  }
}

function toCpmTask(row: CpmScheduleTaskRow): CpmTask {
  return {
    id: row.id,
    taskType: row.taskType,
    parentId: row.parentTaskId,
    durationMinutes: row.durationMinutes ?? 0,
    calendarId: row.calendarId ?? "",
    constraintType: row.constraintType,
    constraintDate: row.constraintDate ? row.constraintDate.toISOString() : null,
    percentComplete: row.percentComplete,
    actualStart: row.actualStart ? row.actualStart.toISOString() : null,
    actualFinish: row.actualFinish ? row.actualFinish.toISOString() : null,
  };
}

function toCpmDependency(row: TaskDependencyRow): CpmDependency {
  return { predecessorId: row.predecessorId, successorId: row.successorId, type: row.type, lagMinutes: row.lagMinutes };
}

function toCpmCalendar(row: CalendarRow, exceptions: (typeof schema.calendarExceptions.$inferSelect)[]): CpmCalendar {
  return {
    id: row.id,
    hoursPerDay: Number(row.hoursPerDay),
    workingDays: row.workingDays,
    isDefault: row.isDefault,
    exceptions: exceptions
      .filter((e) => e.calendarId === row.id)
      .map((e) => ({ date: e.date, isWorking: e.isWorking, workingMinutes: e.workingMinutes ?? undefined })),
  };
}

/** Applies a taskEdits patch to an in-memory CpmTask array without touching the DB -- shared by preview and apply. */
function applyTaskEditsOverlay(tasks: CpmTask[], edits: ScheduleEditBatchInput["taskEdits"]): CpmTask[] {
  const editByTaskId = new Map(edits.map((e) => [e.taskId, e]));
  return tasks.map((task) => {
    const edit = editByTaskId.get(task.id);
    if (!edit) return task;
    return {
      ...task,
      durationMinutes: edit.durationMinutes ?? task.durationMinutes,
      constraintType: "constraintType" in edit ? (edit.constraintType ?? null) : task.constraintType,
      constraintDate: "constraintDate" in edit ? (edit.constraintDate ?? null) : task.constraintDate,
      percentComplete: edit.percentComplete ?? task.percentComplete,
    };
  });
}

function applyDependencyOverlay(
  dependencyRows: TaskDependencyRow[],
  adds: ScheduleEditBatchInput["dependencyAdds"],
  removeIds: string[],
): CpmDependency[] {
  const removeSet = new Set(removeIds);
  const kept = dependencyRows.filter((d) => !removeSet.has(d.id)).map(toCpmDependency);
  const added = adds.map((a) => ({ predecessorId: a.predecessorId, successorId: a.successorId, type: a.type, lagMinutes: a.lagMinutes }));
  return [...kept, ...added];
}

interface LoadedVersionState {
  schedule: ScheduleRow;
  version: ScheduleVersionRow;
  taskRows: CpmScheduleTaskRow[];
  dependencyRows: TaskDependencyRow[];
  calendarRows: CalendarRow[];
  calendars: CpmCalendar[];
}

async function loadVersionState(tx: Tx, versionId: string): Promise<LoadedVersionState> {
  const [version] = await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, versionId)).limit(1);
  if (!version) throw new NotFoundError("Schedule version not found");
  const [scheduleRow] = await tx.select().from(schema.schedules).where(eq(schema.schedules.id, version.scheduleId)).limit(1);
  if (!scheduleRow) throw new NotFoundError("Schedule not found");

  const taskRows = await tx.select().from(schema.cpmScheduleTasks).where(eq(schema.cpmScheduleTasks.versionId, versionId));
  const dependencyRows =
    taskRows.length > 0
      ? await tx
          .select()
          .from(schema.taskDependencies)
          .where(
            inArray(
              schema.taskDependencies.successorId,
              taskRows.map((t) => t.id),
            ),
          )
      : [];
  const calendarRows = await tx.select().from(schema.calendars).where(eq(schema.calendars.projectId, scheduleRow.projectId));
  const calendarIds = calendarRows.map((c) => c.id);
  const exceptionRows =
    calendarIds.length > 0
      ? await tx.select().from(schema.calendarExceptions).where(inArray(schema.calendarExceptions.calendarId, calendarIds))
      : [];
  const calendars = calendarRows.map((c) => toCpmCalendar(c, exceptionRows));

  return { schedule: scheduleRow, version, taskRows, dependencyRows, calendarRows, calendars };
}

function requireEditsReferenceKnownTasks(state: LoadedVersionState, edits: ScheduleEditBatchInput): void {
  const knownIds = new Set(state.taskRows.map((t) => t.id));
  for (const edit of edits.taskEdits) {
    if (!knownIds.has(edit.taskId)) throw new ApiError(400, "validation_error", `Task "${edit.taskId}" is not part of this schedule version`);
  }
  for (const add of edits.dependencyAdds) {
    if (!knownIds.has(add.predecessorId) || !knownIds.has(add.successorId)) {
      throw new ApiError(400, "validation_error", "Dependency references a task outside this schedule version");
    }
  }
  const knownDepIds = new Set(state.dependencyRows.map((d) => d.id));
  for (const removeId of edits.dependencyRemoveIds) {
    if (!knownDepIds.has(removeId)) throw new ApiError(400, "validation_error", `Dependency "${removeId}" is not part of this schedule version`);
  }
}

function runComputeOnOverlay(state: LoadedVersionState, edits: ScheduleEditBatchInput): CpmResult {
  const overlayTasks = applyTaskEditsOverlay(state.taskRows.map(toCpmTask), edits.taskEdits);
  const overlayDeps = applyDependencyOverlay(state.dependencyRows, edits.dependencyAdds, edits.dependencyRemoveIds);
  return computeSchedule({
    tasks: overlayTasks,
    dependencies: overlayDeps,
    calendars: state.calendars,
    dataDate: new Date(`${state.version.dataDate}T00:00:00.000Z`).toISOString(),
    options: DEFAULT_CPM_OPTIONS,
  });
}

async function requireNativeEditingEnabled(tx: Tx, versionId: string): Promise<LoadedVersionState> {
  const state = await loadVersionState(tx, versionId);
  if (!state.schedule.nativeEditingEnabled) throw new ScheduleEditNotEnabledError();
  // computeSchedule requires a calendar for every task; a CSV import (the one source format with no
  // calendar block, see importers/csv.ts) leaves a schedule with zero calendar rows, which would
  // otherwise crash the engine rather than fail cleanly the first time editing is attempted on it.
  if (state.calendars.length === 0) {
    throw new ApiError(422, "no_calendar", "This schedule has no calendar to compute against -- re-import from a source format that includes one (MS Project XML or Primavera P6) before enabling native editing.");
  }
  return state;
}

/** Toggles the Tier B editing flag for a project's schedule. Gated at "admin" -- same level project_manager/owner_admin already hold on every other schedule action. */
export async function setNativeEditingEnabled(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  scheduleId: string,
  enabled: boolean,
): Promise<ScheduleRow> {
  requirePermission(ctx, "schedule", "admin");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.schedules).where(eq(schema.schedules.id, scheduleId)).limit(1);
    if (!existing) throw new NotFoundError("Schedule not found");
    const [updated] = await tx
      .update(schema.schedules)
      .set({ nativeEditingEnabled: enabled, updatedAt: new Date() })
      .where(eq(schema.schedules.id, scheduleId))
      .returning();
    if (!updated) throw new Error("Failed to update schedule");
    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "schedule",
      entityId: scheduleId,
      action: enabled ? "enable_native_editing" : "disable_native_editing",
      after: { nativeEditingEnabled: enabled },
    });
    return updated;
  });
}

/** Computes the impact of a proposed batch of edits WITHOUT persisting anything -- backs the Gantt's "preview before commit" requirement. */
export async function previewScheduleEdits(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  versionId: string,
  edits: ScheduleEditBatchInput,
): Promise<CpmResult> {
  requirePermission(ctx, "schedule", "standard");
  return withUserContext(appDb, userId, async (tx) => {
    const state = await requireNativeEditingEnabled(tx, versionId);
    requireEditsReferenceKnownTasks(state, edits);
    return runComputeOnOverlay(state, edits);
  });
}

export interface ScheduleEditResult {
  cpmResult: CpmResult;
  tasks: CpmScheduleTaskRow[];
  dependencies: TaskDependencyRow[];
}

/** Persists a batch of edits, then recomputes and writes back the entire version's CPM fields (any task's dates can shift, not just the edited ones). Rejects the whole batch if it would introduce a dependency cycle. */
export async function applyScheduleEdits(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  versionId: string,
  edits: ScheduleEditBatchInput,
): Promise<ScheduleEditResult> {
  requirePermission(ctx, "schedule", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const state = await requireNativeEditingEnabled(tx, versionId);
    requireEditsReferenceKnownTasks(state, edits);

    const cpmResult = runComputeOnOverlay(state, edits);
    if (cpmResult.cycle) throw new DependencyCycleError(cpmResult.cycle.taskIds);

    for (const edit of edits.taskEdits) {
      const patch: Partial<typeof schema.cpmScheduleTasks.$inferInsert> = {};
      if (edit.name !== undefined) patch.name = edit.name;
      if (edit.durationMinutes !== undefined) patch.durationMinutes = edit.durationMinutes;
      if ("constraintType" in edit) patch.constraintType = edit.constraintType ?? null;
      if ("constraintDate" in edit) patch.constraintDate = edit.constraintDate ? new Date(edit.constraintDate) : null;
      if (edit.percentComplete !== undefined) patch.percentComplete = edit.percentComplete;
      if (Object.keys(patch).length > 0) {
        await tx.update(schema.cpmScheduleTasks).set(patch).where(eq(schema.cpmScheduleTasks.id, edit.taskId));
      }
    }

    if (edits.dependencyRemoveIds.length > 0) {
      await tx.delete(schema.taskDependencies).where(inArray(schema.taskDependencies.id, edits.dependencyRemoveIds));
    }

    if (edits.dependencyAdds.length > 0) {
      try {
        await tx.insert(schema.taskDependencies).values(
          edits.dependencyAdds.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId, type: d.type, lagMinutes: d.lagMinutes })),
        );
      } catch (err) {
        throw new ApiError(409, "duplicate_dependency", `Could not add dependency: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const byId = new Map(cpmResult.tasks.map((r) => [r.id, r]));
    for (const taskRow of state.taskRows) {
      const result = byId.get(taskRow.id);
      if (!result || !result.earlyStart) continue; // an empty-summary degenerate result carries no meaningful dates
      await tx
        .update(schema.cpmScheduleTasks)
        .set({
          // Once native editing is live, "planned" and "early" are the same thing -- our own engine's
          // current computed schedule -- so the Gantt (which renders plannedStart/Finish preferentially,
          // see taskDateRange() in the web app) reflects every edit's ripple effect, not just the task
          // that was directly dragged. A separate, frozen baseline (task_baseline_values) is unaffected.
          plannedStart: new Date(result.earlyStart),
          plannedFinish: new Date(result.earlyFinish),
          earlyStart: new Date(result.earlyStart),
          earlyFinish: new Date(result.earlyFinish),
          lateStart: new Date(result.lateStart),
          lateFinish: new Date(result.lateFinish),
          totalFloatMinutes: result.totalFloatMinutes,
          freeFloatMinutes: result.freeFloatMinutes,
          isCritical: result.isCritical,
          percentComplete: result.percentComplete,
        })
        .where(eq(schema.cpmScheduleTasks.id, taskRow.id));
    }

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "schedule_version",
      entityId: versionId,
      action: "native_edit",
      after: { taskEdits: edits.taskEdits.length, dependencyAdds: edits.dependencyAdds.length, dependencyRemoves: edits.dependencyRemoveIds.length },
    });

    const tasks = await tx.select().from(schema.cpmScheduleTasks).where(eq(schema.cpmScheduleTasks.versionId, versionId));
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

    return { cpmResult, tasks, dependencies };
  });
}

/** Re-derives the CPM fields for every task in a version from its currently-stored tasks/dependencies/calendars, with no edits -- useful after an out-of-band change (e.g. an accepted field progress update) to bring dates/float/critical-path back in sync. */
export async function recomputeVersion(appDb: Database, userId: string, ctx: PermissionContext, versionId: string): Promise<ScheduleEditResult> {
  return applyScheduleEdits(appDb, userId, ctx, versionId, { taskEdits: [], dependencyAdds: [], dependencyRemoveIds: [] });
}

/** MS Project XML export of the version's current (persisted) computed state -- a round-trip with the importer's own format. Read-only, so gated at "read" like any other export, not tied to the editing flag. */
export async function exportVersionXml(appDb: Database, userId: string, ctx: PermissionContext, versionId: string): Promise<string> {
  requirePermission(ctx, "schedule", "read");
  return withUserContext(appDb, userId, async (tx) => {
    const state = await loadVersionState(tx, versionId);
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, state.schedule.projectId)).limit(1);
    return buildMsProjectXml({
      projectName: project?.name ?? "SiteOps Schedule",
      dataDate: state.version.dataDate,
      calendars: state.calendarRows.map((c) => ({ id: c.id, name: c.name, isDefault: c.isDefault, workingDays: c.workingDays })),
      tasks: state.taskRows.map((t) => ({
        id: t.id,
        parentTaskId: t.parentTaskId,
        wbsCode: t.wbsCode,
        name: t.name,
        taskType: t.taskType,
        durationMinutes: t.durationMinutes,
        calendarId: t.calendarId,
        earlyStart: t.earlyStart,
        earlyFinish: t.earlyFinish,
        actualStart: t.actualStart,
        actualFinish: t.actualFinish,
        totalFloatMinutes: t.totalFloatMinutes,
        freeFloatMinutes: t.freeFloatMinutes,
        isCritical: t.isCritical,
        percentComplete: t.percentComplete,
        physicalPercentComplete: t.physicalPercentComplete,
        constraintType: t.constraintType,
        constraintDate: t.constraintDate,
        sortOrder: t.sortOrder,
      })),
      dependencies: state.dependencyRows.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId, type: d.type, lagMinutes: d.lagMinutes })),
    });
  });
}
