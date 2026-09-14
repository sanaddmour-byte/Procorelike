import { workingTimeAdd, workingTimeBetween, workingTimeSubtract, type CalendarInput } from "./calendar";

/**
 * The pure, deterministic CPM engine (docs/SCHEDULING.md A4, Phase 11d /
 * Tier B). No database access, no I/O, no `Date.now()` -- every date in
 * and out is an explicit ISO string, so the same input always produces
 * the same output regardless of when or where it runs. This is what
 * makes the 25-scenario golden-file suite in cpm.test.ts meaningful.
 */

export type CpmTaskType = "task" | "summary" | "milestone" | "loe" | "wbs";
export type CpmConstraintType = "asap" | "alap" | "snet" | "snlt" | "fnet" | "fnlt" | "mso" | "mfo";
export type CpmDependencyType = "FS" | "SS" | "FF" | "SF";

export interface CpmTask {
  id: string;
  taskType: CpmTaskType;
  /** Self-referencing parent for WBS/summary rollup; null/undefined at the top level. */
  parentId?: string | null;
  /** Ignored (treated as 0) for milestone/summary/wbs tasks. */
  durationMinutes: number;
  calendarId: string;
  constraintType?: CpmConstraintType | null;
  /** ISO instant. Required when constraintType is set to anything other than asap/alap. */
  constraintDate?: string | null;
  /** 0-100. */
  percentComplete: number;
  actualStart?: string | null;
  actualFinish?: string | null;
}

export interface CpmDependency {
  predecessorId: string;
  successorId: string;
  type: CpmDependencyType;
  /** Working minutes; negative values are a valid lead/overlap. */
  lagMinutes: number;
}

export interface CpmCalendarException {
  date: string;
  isWorking: boolean;
  workingMinutes?: number;
}

export interface CpmCalendar {
  id: string;
  hoursPerDay: number;
  workingDays: number;
  exceptions: CpmCalendarException[];
  isDefault?: boolean;
}

export interface CpmOptions {
  /**
   * How progress on an in-progress task affects its remaining work's
   * start: `true` keeps the remaining work anchored to predecessor logic
   * (never earlier than the data date); `false` ("progress override")
   * resumes the remaining work exactly at the data date regardless of
   * what predecessor logic would otherwise compute -- the out-of-sequence
   * progress case docs/SCHEDULING.md A4.6 calls for.
   */
  retainedLogic: boolean;
  /**
   * When true, "no earlier/later than" constraints (snet/fnet/snlt/fnlt)
   * are not applied to any task that computes as critical -- a second
   * internal pass re-runs the engine once criticality is known. `mso`/
   * `mfo` (hard "must" constraints) are never suppressed, since ignoring
   * those would silently produce a schedule inconsistent with what the
   * source file actually specifies.
   */
  ignoreConstraintsOnCritical?: boolean;
  /** Total float at or below this is "critical". Working minutes. Default 0. */
  criticalFloatThresholdMinutes?: number;
}

export interface ComputeScheduleInput {
  tasks: CpmTask[];
  dependencies: CpmDependency[];
  calendars: CpmCalendar[];
  /** ISO instant -- also the forward-pass anchor for any task with no predecessors that hasn't started. */
  dataDate: string;
  options: CpmOptions;
}

export interface CpmTaskResult {
  id: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  totalFloatMinutes: number;
  freeFloatMinutes: number;
  isCritical: boolean;
  /** Echoed for leaf tasks; duration-weighted roll-up for summary/wbs tasks. */
  percentComplete: number;
}

export interface CpmWarning {
  code: "constraint_violation" | "orphaned_predecessor" | "orphaned_successor";
  taskId: string;
  message: string;
}

export interface CpmCycle {
  /** Every task participating in (or blocked behind) a dependency cycle. */
  taskIds: string[];
}

export interface CpmResult {
  tasks: CpmTaskResult[];
  warnings: CpmWarning[];
  cycle: CpmCycle | null;
}

function topoSort(taskIds: string[], edges: { from: string; to: string }[]): { order: string[]; cycle: string[] | null } {
  const inDegree = new Map<string, number>(taskIds.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(taskIds.map((id) => [id, []]));
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !inDegree.has(edge.to)) continue; // orphaned edges are reported separately, not sorted
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }
  const queue: string[] = taskIds.filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];
  const inOrder = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    inOrder.add(id);
    for (const next of adjacency.get(id)!) {
      const remaining = inDegree.get(next)! - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  if (order.length < taskIds.length) {
    return { order: [], cycle: taskIds.filter((id) => !inOrder.has(id)) };
  }
  return { order, cycle: null };
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

interface WorkingTask {
  duration: number;
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
}

/** One full forward+backward pass. Called twice when `ignoreConstraintsOnCritical` is set -- see that option's doc comment. */
function runPass(
  schedulable: CpmTask[],
  dependencies: CpmDependency[],
  calendarById: Map<string, CalendarInput>,
  dataDate: Date,
  options: CpmOptions,
  suppressSoftConstraintsFor: ReadonlySet<string>,
): { results: Map<string, WorkingTask>; warnings: CpmWarning[] } {
  const warnings: CpmWarning[] = [];
  const taskById = new Map(schedulable.map((t) => [t.id, t]));
  const predsOf = new Map<string, CpmDependency[]>();
  const succsOf = new Map<string, CpmDependency[]>();
  for (const dep of dependencies) {
    if (!taskById.has(dep.predecessorId) || !taskById.has(dep.successorId)) continue;
    (predsOf.get(dep.successorId) ?? predsOf.set(dep.successorId, []).get(dep.successorId)!).push(dep);
    (succsOf.get(dep.predecessorId) ?? succsOf.set(dep.predecessorId, []).get(dep.predecessorId)!).push(dep);
  }

  const { order, cycle } = topoSort(
    schedulable.map((t) => t.id),
    dependencies.map((d) => ({ from: d.predecessorId, to: d.successorId })),
  );
  if (cycle) {
    return { results: new Map(), warnings: [{ code: "constraint_violation", taskId: cycle[0] ?? "", message: "cycle" }] };
  }

  const results = new Map<string, WorkingTask>();

  // Forward pass.
  for (const id of order) {
    const task = taskById.get(id)!;
    const calendar = calendarById.get(task.calendarId)!;
    const duration = task.taskType === "milestone" ? 0 : task.durationMinutes;
    const preds = predsOf.get(id) ?? [];

    let earlyStart: Date;
    if (preds.length === 0) {
      earlyStart = maxDate(workingTimeAdd(calendar, dataDate, 0), dataDate);
    } else {
      const candidates = preds.map((dep) => {
        const pred = results.get(dep.predecessorId)!;
        switch (dep.type) {
          case "FS":
            return workingTimeAdd(calendar, pred.earlyFinish, dep.lagMinutes);
          case "SS":
            return workingTimeAdd(calendar, pred.earlyStart, dep.lagMinutes);
          case "FF": {
            const finish = workingTimeAdd(calendar, pred.earlyFinish, dep.lagMinutes);
            return workingTimeSubtract(calendar, finish, duration);
          }
          case "SF": {
            const finish = workingTimeAdd(calendar, pred.earlyStart, dep.lagMinutes);
            return workingTimeSubtract(calendar, finish, duration);
          }
        }
      });
      earlyStart = candidates.reduce((acc, d) => maxDate(acc, d));
    }

    const suppressSoft = suppressSoftConstraintsFor.has(id);
    if (task.constraintType && task.constraintDate) {
      const constraintDate = new Date(task.constraintDate);
      switch (task.constraintType) {
        case "snet":
          if (!suppressSoft) earlyStart = maxDate(earlyStart, constraintDate);
          break;
        case "snlt":
          if (!suppressSoft && earlyStart.getTime() > constraintDate.getTime()) {
            warnings.push({ code: "constraint_violation", taskId: id, message: `Computed start is after the "start no later than" constraint of ${task.constraintDate}` });
          }
          break;
        case "mso":
          if (earlyStart.getTime() > constraintDate.getTime()) {
            warnings.push({ code: "constraint_violation", taskId: id, message: `Predecessor logic requires a later start than the "must start on" constraint of ${task.constraintDate}` });
          }
          earlyStart = constraintDate;
          break;
        default:
          break;
      }
    }

    let earlyFinish: Date;
    let displayEarlyStart = earlyStart;
    if (task.actualFinish) {
      displayEarlyStart = new Date(task.actualStart ?? task.actualFinish);
      earlyStart = displayEarlyStart;
      earlyFinish = new Date(task.actualFinish);
    } else if (task.actualStart) {
      const remainingMinutes = Math.round(duration * (1 - task.percentComplete / 100));
      const actualStart = new Date(task.actualStart);
      displayEarlyStart = actualStart;
      const remainingStart = options.retainedLogic ? maxDate(earlyStart, dataDate) : maxDate(actualStart, dataDate);
      earlyStart = remainingStart;
      earlyFinish = remainingMinutes > 0 ? workingTimeAdd(calendar, remainingStart, remainingMinutes) : remainingStart;
    } else {
      earlyFinish = duration > 0 ? workingTimeAdd(calendar, earlyStart, duration) : earlyStart;
    }

    if (task.constraintType && task.constraintDate && !task.actualStart && !task.actualFinish) {
      const constraintDate = new Date(task.constraintDate);
      if (task.constraintType === "fnet" && !suppressSoft && earlyFinish.getTime() < constraintDate.getTime()) {
        earlyFinish = constraintDate;
        earlyStart = duration > 0 ? workingTimeSubtract(calendar, earlyFinish, duration) : earlyFinish;
        displayEarlyStart = earlyStart;
      } else if (task.constraintType === "fnlt" && !suppressSoft && earlyFinish.getTime() > constraintDate.getTime()) {
        warnings.push({ code: "constraint_violation", taskId: id, message: `Computed finish is after the "finish no later than" constraint of ${task.constraintDate}` });
      } else if (task.constraintType === "mfo") {
        if (earlyFinish.getTime() > constraintDate.getTime()) {
          warnings.push({ code: "constraint_violation", taskId: id, message: `Predecessor logic requires a later finish than the "must finish on" constraint of ${task.constraintDate}` });
        }
        earlyFinish = constraintDate;
        earlyStart = duration > 0 ? workingTimeSubtract(calendar, earlyFinish, duration) : earlyFinish;
        displayEarlyStart = earlyStart;
      }
    }

    results.set(id, { duration, earlyStart: displayEarlyStart, earlyFinish, lateStart: earlyStart, lateFinish: earlyFinish });
  }

  const projectEnd = order.reduce<Date | null>((acc, id) => {
    const finish = results.get(id)!.earlyFinish;
    return acc === null ? finish : maxDate(acc, finish);
  }, null);

  // Backward pass, reverse topological order.
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!;
    const task = taskById.get(id)!;
    const calendar = calendarById.get(task.calendarId)!;
    const working = results.get(id)!;
    const duration = working.duration;
    const succs = succsOf.get(id) ?? [];

    let lateFinish: Date;
    if (succs.length === 0) {
      lateFinish = projectEnd ?? working.earlyFinish;
    } else {
      const candidates = succs.map((dep) => {
        const succ = results.get(dep.successorId)!;
        switch (dep.type) {
          case "FS":
            return workingTimeSubtract(calendar, succ.lateStart, dep.lagMinutes);
          case "SS": {
            const ls = workingTimeSubtract(calendar, succ.lateStart, dep.lagMinutes);
            return duration > 0 ? workingTimeAdd(calendar, ls, duration) : ls;
          }
          case "FF":
            return workingTimeSubtract(calendar, succ.lateFinish, dep.lagMinutes);
          case "SF": {
            const ls = workingTimeSubtract(calendar, succ.lateFinish, dep.lagMinutes);
            return duration > 0 ? workingTimeAdd(calendar, ls, duration) : ls;
          }
        }
      });
      lateFinish = candidates.reduce((acc, d) => minDate(acc, d));
    }

    const suppressSoft = suppressSoftConstraintsFor.has(id);
    if (task.constraintType && task.constraintDate && !task.actualFinish) {
      const constraintDate = new Date(task.constraintDate);
      if (task.constraintType === "fnlt" && !suppressSoft) {
        lateFinish = minDate(lateFinish, constraintDate);
      } else if (task.constraintType === "mfo") {
        lateFinish = constraintDate;
      }
    }

    let lateStart = duration > 0 ? workingTimeSubtract(calendar, lateFinish, duration) : lateFinish;

    if (task.constraintType && task.constraintDate && !task.actualFinish) {
      const constraintDate = new Date(task.constraintDate);
      if (task.constraintType === "snlt" && !suppressSoft) {
        lateStart = minDate(lateStart, constraintDate);
        lateFinish = duration > 0 ? workingTimeAdd(calendar, lateStart, duration) : lateStart;
      } else if (task.constraintType === "mso") {
        lateStart = constraintDate;
        lateFinish = duration > 0 ? workingTimeAdd(calendar, lateStart, duration) : lateStart;
      }
    }

    if (task.actualFinish) {
      lateStart = working.earlyStart;
      lateFinish = working.earlyFinish;
    }

    working.lateStart = lateStart;
    working.lateFinish = lateFinish;
  }

  // ALAP: a lightweight post-pass approximation (docs comment on CpmOptions/constraint list) --
  // successors already propagated off the true early dates above, so adjusting an ALAP task's
  // own display dates afterward doesn't corrupt downstream logic, it only zeroes its own float.
  for (const id of order) {
    const task = taskById.get(id)!;
    if (task.constraintType === "alap" && !task.actualFinish) {
      const working = results.get(id)!;
      working.earlyStart = working.lateStart;
      working.earlyFinish = working.lateFinish;
    }
  }

  return { results, warnings };
}

function computeFreeFloat(
  id: string,
  working: WorkingTask,
  succsOf: Map<string, CpmDependency[]>,
  results: Map<string, WorkingTask>,
  calendarById: Map<string, CalendarInput>,
  taskById: Map<string, CpmTask>,
): number {
  const succs = succsOf.get(id) ?? [];
  if (succs.length === 0) {
    return workingTimeBetween(calendarById.get(taskById.get(id)!.calendarId)!, working.earlyStart, working.lateStart);
  }
  const slacks = succs.map((dep) => {
    const calendar = calendarById.get(taskById.get(id)!.calendarId)!;
    const succ = results.get(dep.successorId)!;
    switch (dep.type) {
      case "FS":
        return workingTimeBetween(calendar, workingTimeAdd(calendar, working.earlyFinish, dep.lagMinutes), succ.earlyStart);
      case "SS":
        return workingTimeBetween(calendar, workingTimeAdd(calendar, working.earlyStart, dep.lagMinutes), succ.earlyStart);
      case "FF":
        return workingTimeBetween(calendar, workingTimeAdd(calendar, working.earlyFinish, dep.lagMinutes), succ.earlyFinish);
      case "SF":
        return workingTimeBetween(calendar, workingTimeAdd(calendar, working.earlyStart, dep.lagMinutes), succ.earlyFinish);
    }
  });
  return Math.min(...slacks);
}

/** Duration-weighted roll-up of dates and progress from children onto their WBS/summary ancestors. Summary tasks are never directly scheduled -- their own duration/calendar fields are ignored. */
function rollUpSummaries(tasks: CpmTask[], leafResults: Map<string, CpmTaskResult>): Map<string, CpmTaskResult> {
  const byParent = new Map<string, CpmTask[]>();
  for (const task of tasks) {
    if (task.parentId) (byParent.get(task.parentId) ?? byParent.set(task.parentId, []).get(task.parentId)!).push(task);
  }
  const rolled = new Map(leafResults);

  function rollUp(taskId: string): CpmTaskResult {
    const cached = rolled.get(taskId);
    if (cached) return cached;
    const children = byParent.get(taskId) ?? [];
    const childResults = children.map((c) => rollUp(c.id));
    if (childResults.length === 0) {
      // A summary/wbs task with no children carries no meaningful dates; degenerate to the data date.
      const empty: CpmTaskResult = { id: taskId, earlyStart: "", earlyFinish: "", lateStart: "", lateFinish: "", totalFloatMinutes: 0, freeFloatMinutes: 0, isCritical: false, percentComplete: 0 };
      rolled.set(taskId, empty);
      return empty;
    }
    const totalDuration = children.reduce((sum, c) => sum + (c.taskType === "milestone" ? 0 : c.durationMinutes), 0);
    const weightedPercent =
      totalDuration > 0
        ? children.reduce((sum, c, i) => sum + (c.taskType === "milestone" ? 0 : c.durationMinutes) * childResults[i]!.percentComplete, 0) / totalDuration
        : childResults.reduce((sum, r) => sum + r.percentComplete, 0) / childResults.length;
    const result: CpmTaskResult = {
      id: taskId,
      earlyStart: childResults.reduce((min, r) => (r.earlyStart < min ? r.earlyStart : min), childResults[0]!.earlyStart),
      earlyFinish: childResults.reduce((max, r) => (r.earlyFinish > max ? r.earlyFinish : max), childResults[0]!.earlyFinish),
      lateStart: childResults.reduce((min, r) => (r.lateStart < min ? r.lateStart : min), childResults[0]!.lateStart),
      lateFinish: childResults.reduce((max, r) => (r.lateFinish > max ? r.lateFinish : max), childResults[0]!.lateFinish),
      totalFloatMinutes: Math.min(...childResults.map((r) => r.totalFloatMinutes)),
      freeFloatMinutes: Math.min(...childResults.map((r) => r.freeFloatMinutes)),
      isCritical: childResults.some((r) => r.isCritical),
      percentComplete: Math.round(weightedPercent),
    };
    rolled.set(taskId, result);
    return result;
  }

  for (const task of tasks) {
    if (task.taskType === "summary" || task.taskType === "wbs") rollUp(task.id);
  }
  return rolled;
}

export function computeSchedule(input: ComputeScheduleInput): CpmResult {
  const { tasks, dependencies, calendars, dataDate, options } = input;
  const calendarById = new Map<string, CalendarInput>(calendars.map((c) => [c.id, c]));
  const defaultCalendar = calendars.find((c) => c.isDefault) ?? calendars[0];
  const threshold = options.criticalFloatThresholdMinutes ?? 0;

  const schedulable = tasks.filter((t) => t.taskType !== "summary" && t.taskType !== "wbs");
  const schedulableIds = new Set(schedulable.map((t) => t.id));

  const warnings: CpmWarning[] = [];
  for (const dep of dependencies) {
    if (!schedulableIds.has(dep.predecessorId)) warnings.push({ code: "orphaned_predecessor", taskId: dep.predecessorId, message: `Dependency references unknown or non-schedulable predecessor "${dep.predecessorId}"` });
    if (!schedulableIds.has(dep.successorId)) warnings.push({ code: "orphaned_successor", taskId: dep.successorId, message: `Dependency references unknown or non-schedulable successor "${dep.successorId}"` });
  }

  for (const task of schedulable) {
    if (!calendarById.has(task.calendarId) && defaultCalendar) calendarById.set(task.calendarId, defaultCalendar);
  }

  const dataDateInstant = new Date(dataDate);
  const taskById = new Map(schedulable.map((t) => [t.id, t]));
  const succsOf = new Map<string, CpmDependency[]>();
  for (const dep of dependencies) {
    if (!taskById.has(dep.predecessorId) || !taskById.has(dep.successorId)) continue;
    (succsOf.get(dep.predecessorId) ?? succsOf.set(dep.predecessorId, []).get(dep.predecessorId)!).push(dep);
  }

  let pass = runPass(schedulable, dependencies, calendarById, dataDateInstant, options, new Set());
  if (pass.warnings.some((w) => w.message === "cycle")) {
    const cycleTaskId = pass.warnings[0]!.taskId;
    const { cycle } = topoSort(
      schedulable.map((t) => t.id),
      dependencies.map((d) => ({ from: d.predecessorId, to: d.successorId })),
    );
    return { tasks: [], warnings: [], cycle: { taskIds: cycle ?? [cycleTaskId] } };
  }

  let leafResults: CpmTaskResult[] = schedulable.map((task) => {
    const working = pass.results.get(task.id)!;
    const totalFloat = workingTimeBetween(calendarById.get(task.calendarId)!, working.earlyStart, working.lateStart);
    const freeFloat = computeFreeFloat(task.id, working, succsOf, pass.results, calendarById, taskById);
    return {
      id: task.id,
      earlyStart: working.earlyStart.toISOString(),
      earlyFinish: working.earlyFinish.toISOString(),
      lateStart: working.lateStart.toISOString(),
      lateFinish: working.lateFinish.toISOString(),
      totalFloatMinutes: Math.round(totalFloat),
      freeFloatMinutes: Math.round(freeFloat),
      isCritical: totalFloat <= threshold,
      percentComplete: task.percentComplete,
    };
  });

  if (options.ignoreConstraintsOnCritical) {
    const criticalIds = new Set(leafResults.filter((r) => r.isCritical).map((r) => r.id));
    if (criticalIds.size > 0) {
      pass = runPass(schedulable, dependencies, calendarById, dataDateInstant, options, criticalIds);
      leafResults = schedulable.map((task) => {
        const working = pass.results.get(task.id)!;
        const totalFloat = workingTimeBetween(calendarById.get(task.calendarId)!, working.earlyStart, working.lateStart);
        const freeFloat = computeFreeFloat(task.id, working, succsOf, pass.results, calendarById, taskById);
        return {
          id: task.id,
          earlyStart: working.earlyStart.toISOString(),
          earlyFinish: working.earlyFinish.toISOString(),
          lateStart: working.lateStart.toISOString(),
          lateFinish: working.lateFinish.toISOString(),
          totalFloatMinutes: Math.round(totalFloat),
          freeFloatMinutes: Math.round(freeFloat),
          isCritical: totalFloat <= threshold,
          percentComplete: task.percentComplete,
        };
      });
    }
  }

  const byId = new Map(leafResults.map((r) => [r.id, r]));
  const rolled = rollUpSummaries(tasks, byId);
  const allResults = tasks.map((t) => rolled.get(t.id)!);

  return { tasks: allResults, warnings: [...warnings, ...pass.warnings.filter((w) => w.message !== "cycle")], cycle: null };
}
