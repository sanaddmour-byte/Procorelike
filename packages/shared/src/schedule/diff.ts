import type { ParsedSchedule, ParsedTask } from "./types";

export type ScheduleDiffChangeType = "added" | "removed" | "re_dated" | "re_logicked" | "progress_changed";

export interface ScheduleTaskDiffEntry {
  externalId: string;
  name: string;
  changeType: ScheduleDiffChangeType;
  /** Only for re_dated: the shift in days (positive = pushed out later, negative = pulled in earlier), based on plannedStart. */
  startShiftDays?: number;
  previousPercentComplete?: number;
  newPercentComplete?: number;
}

export interface ScheduleDiff {
  added: ScheduleTaskDiffEntry[];
  removed: ScheduleTaskDiffEntry[];
  reDated: ScheduleTaskDiffEntry[];
  reLogicked: ScheduleTaskDiffEntry[];
  progressChanged: ScheduleTaskDiffEntry[];
}

/** A previous version's task, reduced to only what the diff needs -- callers pass rows straight from the DB. */
export interface PreviousVersionTask {
  externalId: string;
  wbsCode?: string | null;
  name: string;
  plannedStart?: string | null;
  percentComplete: number;
  /** externalIds of this task's direct predecessors in the previous version. */
  predecessorExternalIds: string[];
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

/**
 * Matches a re-imported task back to its previous-version counterpart by
 * externalId first, then wbsCode, then an exact case-insensitive name
 * match, per docs/SCHEDULING.md A2. Pure function -- the caller resolves
 * the DB rows on both sides; this just compares them.
 */
export function diffScheduleVersions(previousTasks: PreviousVersionTask[], nextSchedule: ParsedSchedule): ScheduleDiff {
  const byExternalId = new Map(previousTasks.map((t) => [t.externalId, t]));
  const byWbsCode = new Map(previousTasks.filter((t) => t.wbsCode).map((t) => [t.wbsCode!, t]));
  const byName = new Map(previousTasks.map((t) => [t.name.trim().toLowerCase(), t]));

  const nextDependenciesBySuccessor = new Map<string, string[]>();
  for (const dep of nextSchedule.dependencies) {
    if (!nextDependenciesBySuccessor.has(dep.successorExternalId)) nextDependenciesBySuccessor.set(dep.successorExternalId, []);
    nextDependenciesBySuccessor.get(dep.successorExternalId)!.push(dep.predecessorExternalId);
  }

  function matchPrevious(task: ParsedTask): PreviousVersionTask | undefined {
    return (
      byExternalId.get(task.externalId) ??
      (task.wbsCode ? byWbsCode.get(task.wbsCode) : undefined) ??
      byName.get(task.name.trim().toLowerCase())
    );
  }

  const diff: ScheduleDiff = { added: [], removed: [], reDated: [], reLogicked: [], progressChanged: [] };
  const matchedPreviousExternalIds = new Set<string>();

  for (const task of nextSchedule.tasks) {
    const previous = matchPrevious(task);
    if (!previous) {
      diff.added.push({ externalId: task.externalId, name: task.name, changeType: "added" });
      continue;
    }
    matchedPreviousExternalIds.add(previous.externalId);

    if (previous.plannedStart && task.plannedStart) {
      const shift = daysBetween(previous.plannedStart, task.plannedStart);
      if (shift !== 0) {
        diff.reDated.push({ externalId: task.externalId, name: task.name, changeType: "re_dated", startShiftDays: shift });
      }
    }

    if (previous.percentComplete !== task.percentComplete) {
      diff.progressChanged.push({
        externalId: task.externalId,
        name: task.name,
        changeType: "progress_changed",
        previousPercentComplete: previous.percentComplete,
        newPercentComplete: task.percentComplete,
      });
    }

    const nextPredecessors = new Set(nextDependenciesBySuccessor.get(task.externalId) ?? []);
    const previousPredecessors = new Set(previous.predecessorExternalIds);
    const logicChanged =
      nextPredecessors.size !== previousPredecessors.size || [...nextPredecessors].some((p) => !previousPredecessors.has(p));
    if (logicChanged) {
      diff.reLogicked.push({ externalId: task.externalId, name: task.name, changeType: "re_logicked" });
    }
  }

  for (const previous of previousTasks) {
    if (!matchedPreviousExternalIds.has(previous.externalId)) {
      diff.removed.push({ externalId: previous.externalId, name: previous.name, changeType: "removed" });
    }
  }

  return diff;
}
