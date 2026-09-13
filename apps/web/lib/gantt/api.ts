import type { GanttTask, ScheduleTaskType } from "./types";

/** The subset of a `schedule_tasks` API row the Gantt UI needs -- the row itself carries more (CPM/cost fields not shown yet). */
export interface ApiScheduleTask {
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

export function toGanttTask(row: ApiScheduleTask): GanttTask {
  return {
    id: row.id,
    externalId: row.externalId,
    wbsCode: row.wbsCode,
    parentTaskId: row.parentTaskId,
    name: row.name,
    taskType: row.taskType,
    plannedStart: row.plannedStart,
    plannedFinish: row.plannedFinish,
    earlyStart: row.earlyStart,
    earlyFinish: row.earlyFinish,
    actualStart: row.actualStart,
    actualFinish: row.actualFinish,
    totalFloatMinutes: row.totalFloatMinutes,
    isCritical: row.isCritical,
    percentComplete: row.percentComplete,
    responsibleCompanyId: row.responsibleCompanyId,
    sortOrder: row.sortOrder,
  };
}
