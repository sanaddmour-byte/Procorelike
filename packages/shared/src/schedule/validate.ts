import type { ParsedSchedule, ScheduleImportError } from "./types";

/**
 * Shared validation every importer runs on its ParsedSchedule before
 * returning it, so the "reject and report clearly" rules in
 * docs/SCHEDULING.md A2 are enforced once, not reimplemented per format.
 * Pure function -- no I/O, fully unit-testable without a real file.
 */
export function validateParsedSchedule(schedule: ParsedSchedule): ScheduleImportError[] {
  const errors: ScheduleImportError[] = [];
  const taskIds = new Set(schedule.tasks.map((t) => t.externalId));

  for (const task of schedule.tasks) {
    if (task.durationMinutes !== undefined && task.durationMinutes < 0) {
      errors.push({
        code: "negative_duration",
        message: `Task "${task.name}" (${task.externalId}) has a negative duration`,
        taskExternalIds: [task.externalId],
      });
    }
  }

  for (const dep of schedule.dependencies) {
    if (!taskIds.has(dep.predecessorExternalId)) {
      errors.push({
        code: "orphaned_predecessor",
        message: `Dependency references unknown predecessor task "${dep.predecessorExternalId}"`,
        taskExternalIds: [dep.predecessorExternalId, dep.successorExternalId],
      });
    }
    if (!taskIds.has(dep.successorExternalId)) {
      errors.push({
        code: "orphaned_predecessor",
        message: `Dependency references unknown successor task "${dep.successorExternalId}"`,
        taskExternalIds: [dep.predecessorExternalId, dep.successorExternalId],
      });
    }
  }

  const cycle = findCycle(schedule);
  if (cycle) {
    errors.push({
      code: "circular_dependency",
      message: `Circular dependency detected: ${cycle.join(" -> ")}`,
      taskExternalIds: cycle,
    });
  }

  return errors;
}

/** DFS cycle detection over the predecessor->successor graph. Returns the participating chain, not just a boolean, per A4's "return the participating task chain, do not throw a generic error." */
function findCycle(schedule: ParsedSchedule): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const dep of schedule.dependencies) {
    if (!adjacency.has(dep.predecessorExternalId)) adjacency.set(dep.predecessorExternalId, []);
    adjacency.get(dep.predecessorExternalId)!.push(dep.successorExternalId);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const task of schedule.tasks) color.set(task.externalId, WHITE);

  const stack: string[] = [];

  function visit(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next);
      if (state === GRAY) {
        const cycleStart = stack.indexOf(next);
        return [...stack.slice(cycleStart), next];
      }
      if (state === WHITE) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const task of schedule.tasks) {
    if (color.get(task.externalId) === WHITE) {
      const found = visit(task.externalId);
      if (found) return found;
    }
  }
  return null;
}
