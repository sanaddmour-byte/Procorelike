import type { GanttRow, GanttTask } from "./types";

/**
 * Turns the flat task list (each task carrying a resolved `parentTaskId`)
 * into a depth-first, indent-ordered row list, skipping the descendants
 * of any collapsed node -- the shape a virtualized grid needs, since
 * react-window renders a flat indexed list, not a real tree.
 */
export function flattenWbsTree(tasks: GanttTask[], collapsedIds: ReadonlySet<string>): GanttRow[] {
  const childrenByParent = new Map<string | null, GanttTask[]>();
  for (const task of tasks) {
    const key = task.parentTaskId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(task);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const rows: GanttRow[] = [];

  function visit(parentId: string | null, depth: number): void {
    const children = childrenByParent.get(parentId) ?? [];
    for (const task of children) {
      const taskChildren = childrenByParent.get(task.id) ?? [];
      const hasChildren = taskChildren.length > 0;
      const isCollapsed = collapsedIds.has(task.id);
      rows.push({ ...task, depth, hasChildren, isCollapsed });
      if (hasChildren && !isCollapsed) {
        visit(task.id, depth + 1);
      }
    }
  }

  visit(null, 0);
  return rows;
}
