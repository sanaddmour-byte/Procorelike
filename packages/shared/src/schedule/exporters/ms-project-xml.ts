import { XMLBuilder } from "fast-xml-parser";
import type { CpmConstraintType, CpmDependencyType } from "../cpm";

/**
 * The reverse of ../importers/ms-project-xml.ts -- produces the same MS
 * Project XML shape (Project/Tasks/Task, Project/Calendars/Calendar) that
 * parser reads, so a round-trip (import -> edit -> export -> re-import
 * elsewhere) stays lossless for every field the importer itself
 * understands. Field/enum codes mirror the importer's tables exactly
 * (kept as the inverse of its DEPENDENCY_TYPE_BY_CODE/CONSTRAINT_TYPE_BY_CODE).
 */

const DEPENDENCY_CODE_BY_TYPE: Record<CpmDependencyType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };

const CONSTRAINT_CODE_BY_TYPE: Record<CpmConstraintType, number> = {
  asap: 0,
  alap: 1,
  mso: 2,
  mfo: 3,
  snet: 4,
  snlt: 5,
  fnet: 6,
  fnlt: 7,
};

export interface ExportCalendarInput {
  id: string;
  name: string;
  isDefault: boolean;
  /** Bitmask, bit 0 = Sunday ... bit 6 = Saturday (same convention as CpmCalendar). */
  workingDays: number;
}

export type ExportTaskType = "task" | "summary" | "milestone" | "loe" | "wbs";

export interface ExportTaskInput {
  id: string;
  parentTaskId?: string | null;
  wbsCode?: string | null;
  name: string;
  taskType: ExportTaskType;
  durationMinutes?: number | null;
  calendarId?: string | null;
  earlyStart?: Date | null;
  earlyFinish?: Date | null;
  actualStart?: Date | null;
  actualFinish?: Date | null;
  totalFloatMinutes?: number | null;
  freeFloatMinutes?: number | null;
  isCritical: boolean;
  percentComplete: number;
  physicalPercentComplete?: number | null;
  constraintType?: CpmConstraintType | null;
  constraintDate?: Date | null;
  /** Determines both export order and, via parent-chain depth, OutlineLevel. */
  sortOrder: number;
}

export interface ExportDependencyInput {
  predecessorId: string;
  successorId: string;
  type: CpmDependencyType;
  lagMinutes: number;
}

export interface BuildMsProjectXmlInput {
  projectName: string;
  dataDate: string;
  calendars: ExportCalendarInput[];
  tasks: ExportTaskInput[];
  dependencies: ExportDependencyInput[];
}

function formatMspDuration(minutes: number | null | undefined): string | undefined {
  if (minutes === null || minutes === undefined) return undefined;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `PT${hours}H${mins}M0S`;
}

function outlineLevel(taskId: string, parentById: Map<string, string | null | undefined>): number {
  let level = 1;
  let cursor = parentById.get(taskId);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    level += 1;
    cursor = parentById.get(cursor);
  }
  return level;
}

/** Builds a valid MS Project XML document from the current (computed) schedule state. */
export function buildMsProjectXml(input: BuildMsProjectXmlInput): string {
  const uidByTaskId = new Map<string, number>();
  const sortedTasks = [...input.tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  sortedTasks.forEach((t, i) => uidByTaskId.set(t.id, i + 1));

  const uidByCalendarId = new Map<string, number>();
  input.calendars.forEach((c, i) => uidByCalendarId.set(c.id, i + 1));

  const parentById = new Map<string, string | null | undefined>(sortedTasks.map((t) => [t.id, t.parentTaskId]));
  const summaryTaskIds = new Set(sortedTasks.filter((t) => t.parentTaskId).map((t) => t.parentTaskId!));

  const predecessorsBySuccessor = new Map<string, ExportDependencyInput[]>();
  for (const dep of input.dependencies) {
    if (!predecessorsBySuccessor.has(dep.successorId)) predecessorsBySuccessor.set(dep.successorId, []);
    predecessorsBySuccessor.get(dep.successorId)!.push(dep);
  }

  const calendarXml = input.calendars.map((cal) => ({
    UID: uidByCalendarId.get(cal.id),
    Name: cal.name,
    IsBaseCalendar: cal.isDefault ? 1 : 0,
    WeekDays: {
      WeekDay: Array.from({ length: 7 }, (_, dow) => ({
        DayType: dow + 1,
        DayWorking: ((cal.workingDays >> dow) & 1) === 1 ? 1 : 0,
      })),
    },
  }));

  const taskXml = sortedTasks.map((t) => {
    const predecessors = predecessorsBySuccessor.get(t.id) ?? [];
    const isSummary = t.taskType === "summary" || t.taskType === "wbs" || summaryTaskIds.has(t.id);
    return {
      UID: uidByTaskId.get(t.id),
      Name: t.name,
      ...(t.wbsCode ? { WBS: t.wbsCode } : {}),
      OutlineLevel: outlineLevel(t.id, parentById),
      Summary: isSummary ? 1 : 0,
      Milestone: t.taskType === "milestone" ? 1 : 0,
      ...(t.earlyStart ? { Start: t.earlyStart.toISOString() } : {}),
      ...(t.earlyFinish ? { Finish: t.earlyFinish.toISOString() } : {}),
      ...(t.actualStart ? { ActualStart: t.actualStart.toISOString() } : {}),
      ...(t.actualFinish ? { ActualFinish: t.actualFinish.toISOString() } : {}),
      ...(formatMspDuration(t.durationMinutes) ? { Duration: formatMspDuration(t.durationMinutes) } : {}),
      PercentComplete: t.percentComplete,
      ...(t.physicalPercentComplete !== null && t.physicalPercentComplete !== undefined
        ? { PhysicalPercentComplete: t.physicalPercentComplete }
        : {}),
      ...(t.constraintType ? { ConstraintType: CONSTRAINT_CODE_BY_TYPE[t.constraintType] } : {}),
      ...(t.constraintDate ? { ConstraintDate: t.constraintDate.toISOString() } : {}),
      ...(t.calendarId && uidByCalendarId.has(t.calendarId) ? { CalendarUID: uidByCalendarId.get(t.calendarId) } : {}),
      Critical: t.isCritical ? 1 : 0,
      ...(t.totalFloatMinutes !== null && t.totalFloatMinutes !== undefined ? { TotalSlack: t.totalFloatMinutes } : {}),
      ...(t.freeFloatMinutes !== null && t.freeFloatMinutes !== undefined ? { FreeSlack: t.freeFloatMinutes } : {}),
      ...(predecessors.length > 0
        ? {
            PredecessorLink: predecessors.map((p) => ({
              PredecessorUID: uidByTaskId.get(p.predecessorId),
              Type: DEPENDENCY_CODE_BY_TYPE[p.type],
              LinkLag: p.lagMinutes,
            })),
          }
        : {}),
    };
  });

  const doc = {
    Project: {
      Name: input.projectName,
      StatusDate: input.dataDate,
      CurrentDate: input.dataDate,
      Calendars: { Calendar: calendarXml },
      Tasks: { Task: taskXml },
    },
  };

  const builder = new XMLBuilder({ ignoreAttributes: true, format: true, suppressEmptyNode: true });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(doc)}`;
}
