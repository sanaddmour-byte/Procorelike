import type { GanttTask } from "./types";

export interface GanttFilters {
  search: string;
  criticalOnly: boolean;
  companyId: string | null;
}

export const EMPTY_GANTT_FILTERS: GanttFilters = { search: "", criticalOnly: false, companyId: null };

function isNoop(filters: GanttFilters): boolean {
  return !filters.search.trim() && !filters.criticalOnly && !filters.companyId;
}

function matches(task: GanttTask, search: string, filters: GanttFilters): boolean {
  if (filters.criticalOnly && !task.isCritical) return false;
  if (filters.companyId && task.responsibleCompanyId !== filters.companyId) return false;
  if (search && !task.name.toLowerCase().includes(search) && !(task.wbsCode ?? "").toLowerCase().includes(search)) return false;
  return true;
}

/**
 * Keeps every task that matches the filters, plus all of its WBS ancestors --
 * otherwise a match buried under a non-matching summary task would be
 * unreachable once flattenWbsTree() walks the tree from its (now missing)
 * parent chain.
 */
export function applyGanttFilters(tasks: GanttTask[], filters: GanttFilters): GanttTask[] {
  if (isNoop(filters)) return tasks;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const search = filters.search.trim().toLowerCase();
  const keep = new Set<string>();

  for (const task of tasks) {
    if (!matches(task, search, filters)) continue;
    let current: GanttTask | undefined = task;
    while (current && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parentTaskId ? byId.get(current.parentTaskId) : undefined;
    }
  }

  return tasks.filter((t) => keep.has(t.id));
}
