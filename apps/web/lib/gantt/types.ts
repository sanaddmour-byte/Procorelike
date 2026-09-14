export type ScheduleTaskType = "task" | "summary" | "milestone" | "loe" | "wbs";

export type ScheduleTaskConstraintType = "asap" | "alap" | "snet" | "snlt" | "fnet" | "fnlt" | "mso" | "mfo";
export type ScheduleTaskDependencyType = "FS" | "SS" | "FF" | "SF";

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
  /** Only present/meaningful for Phase 11d native editing (drag resize needs the current value to compute a delta). */
  durationMinutes: number | null;
  constraintType: ScheduleTaskConstraintType | null;
  constraintDate: string | null;
}

export interface GanttDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: ScheduleTaskDependencyType;
  lagMinutes: number;
}

/** A GanttTask plus tree-derived display state, produced by flattenWbsTree(). */
export interface GanttRow extends GanttTask {
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}

/** The result of a completed drag gesture on the Timeline (Phase 11d native editing), handed to the page to preview before committing. */
export type GanttDragEdit =
  | { kind: "move"; taskId: string; newStartDate: Date }
  | { kind: "resize"; taskId: string; newDurationMinutes: number }
  | { kind: "link"; predecessorId: string; successorId: string };
