export type ScheduleTaskType = "task" | "summary" | "milestone" | "loe" | "wbs";

export interface GanttTask {
  id: string;
  externalId: string | null;
  wbsCode: string | null;
  parentTaskId: string | null;
  name: string;
  taskType: ScheduleTaskType;
  plannedStart: string | null;
  plannedFinish: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  totalFloatMinutes: number | null;
  isCritical: boolean;
  percentComplete: number;
  responsibleCompanyId: string | null;
  sortOrder: number;
}

export interface GanttDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: "FS" | "SS" | "FF" | "SF";
  lagMinutes: number;
}

/** A GanttTask plus tree-derived display state, produced by flattenWbsTree(). */
export interface GanttRow extends GanttTask {
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}
