import type { ParsedCalendar, ParsedDependency, ParsedDependencyType, ParsedSchedule, ParsedTask, ParsedTaskType } from "../types";
import { ScheduleImportRejectedError } from "../types";
import { validateParsedSchedule } from "../validate";
import { parseXerText, type XerTables } from "./xer-text";

/**
 * Parses a Primavera P6 XER export -- table/field names below (PROJECT,
 * CALENDAR, PROJWBS, TASK, TASKPRED and their columns) follow the
 * published P6 XER schema from memory; validate against a real P6 export
 * if a specific field turns out to be named or shaped differently.
 *
 * Scope cut, documented rather than silently wrong: XER's `clndr_data`
 * field encodes a calendar's working days/hours/exceptions in P6's own
 * nested mini-language, which is complex enough to be its own project.
 * This importer extracts calendar name/id/default-flag only and defaults
 * every P6 calendar's working pattern to Sun-Thu (docs/SCHEDULING.md
 * A10's "do not default to a Monday-Friday week" still holds even for
 * this simplification) -- real per-calendar exceptions from `clndr_data`
 * are not parsed in this phase.
 */

const TASK_TYPE_BY_XER_CODE: Record<string, ParsedTaskType> = {
  TT_Task: "task",
  TT_Rsrc: "task",
  TT_LOE: "loe",
  TT_Mile: "milestone",
  TT_FinMile: "milestone",
  TT_WBS: "wbs",
};

const DEPENDENCY_TYPE_BY_XER_CODE: Record<string, ParsedDependencyType> = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF",
};

function hoursToMinutes(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : Math.round(n * 60);
}

function dateOrUndefined(value: string | undefined): string | undefined {
  return value && value.trim() !== "" ? value : undefined;
}

function buildCalendars(tables: XerTables): ParsedCalendar[] {
  return (tables.CALENDAR ?? []).map((row) => ({
    externalId: row.clndr_id ?? "",
    name: row.clndr_name ?? row.clndr_id ?? "Unnamed calendar",
    hoursPerDay: 8,
    workingDays: 0b0011111, // Sun-Thu -- see the clndr_data scope note above.
    isDefault: row.default_flag === "Y",
    exceptions: [],
  }));
}

/** PROJWBS rows become "wbs"-type ParsedTasks so P6's WBS hierarchy (separate from activities) has a place in the same flat task list MSP's outline levels use. */
function buildWbsNodes(tables: XerTables): ParsedTask[] {
  return (tables.PROJWBS ?? []).map((row, i) => ({
    externalId: `wbs:${row.wbs_id}`,
    wbsCode: row.wbs_short_name,
    parentExternalId: row.parent_wbs_id ? `wbs:${row.parent_wbs_id}` : undefined,
    name: row.wbs_name ?? row.wbs_short_name ?? "Unnamed WBS",
    taskType: "wbs",
    percentComplete: 0,
    sortOrder: i,
  }));
}

function buildActivities(tables: XerTables, wbsCount: number): ParsedTask[] {
  return (tables.TASK ?? []).map((row, i) => {
    const totalFloatMinutes = hoursToMinutes(row.total_float_hr_cnt);
    return {
      externalId: row.task_id ?? "",
      wbsCode: row.task_code,
      parentExternalId: row.wbs_id ? `wbs:${row.wbs_id}` : undefined,
      name: row.task_name ?? row.task_code ?? "Unnamed activity",
      taskType: (row.task_type && TASK_TYPE_BY_XER_CODE[row.task_type]) || "task",
      durationMinutes: hoursToMinutes(row.target_drtn_hr_cnt),
      calendarExternalId: row.clndr_id,
      plannedStart: dateOrUndefined(row.target_start_date),
      plannedFinish: dateOrUndefined(row.target_end_date),
      earlyStart: dateOrUndefined(row.early_start_date),
      earlyFinish: dateOrUndefined(row.early_end_date),
      lateStart: dateOrUndefined(row.late_start_date),
      lateFinish: dateOrUndefined(row.late_end_date),
      actualStart: dateOrUndefined(row.act_start_date),
      actualFinish: dateOrUndefined(row.act_end_date),
      totalFloatMinutes,
      freeFloatMinutes: hoursToMinutes(row.free_float_hr_cnt),
      isCritical: totalFloatMinutes !== undefined ? totalFloatMinutes <= 0 : false,
      percentComplete: row.phys_complete_pct ? Number(row.phys_complete_pct) : 0,
      physicalPercentComplete: row.phys_complete_pct ? Number(row.phys_complete_pct) : undefined,
      sortOrder: wbsCount + i,
    };
  });
}

function buildDependencies(tables: XerTables): ParsedDependency[] {
  return (tables.TASKPRED ?? []).map((row) => ({
    predecessorExternalId: row.pred_task_id ?? "",
    successorExternalId: row.task_id ?? "",
    type: (row.pred_type && DEPENDENCY_TYPE_BY_XER_CODE[row.pred_type]) || "FS",
    lagMinutes: hoursToMinutes(row.lag_hr_cnt) ?? 0,
  }));
}

export function parseP6Xer(xerText: string): ParsedSchedule {
  if (!xerText.startsWith("ERMHDR")) {
    throw new ScheduleImportRejectedError([{ code: "malformed_file", message: "Not a recognisable P6 XER file (missing ERMHDR header line)" }]);
  }
  const tables = parseXerText(xerText);
  if (!tables.TASK || tables.TASK.length === 0) {
    throw new ScheduleImportRejectedError([{ code: "malformed_file", message: "XER file has no TASK table rows" }]);
  }

  const project = tables.PROJECT?.[0];
  const wbsNodes = buildWbsNodes(tables);
  const activities = buildActivities(tables, wbsNodes.length);

  const schedule: ParsedSchedule = {
    sourceTool: "p6_xer",
    name: project?.proj_short_name,
    dataDate: (project?.last_recalc_date ?? new Date().toISOString()).slice(0, 10),
    calendars: buildCalendars(tables),
    tasks: [...wbsNodes, ...activities],
    dependencies: buildDependencies(tables),
    warnings: [],
  };

  const errors = validateParsedSchedule(schedule);
  if (errors.length > 0) throw new ScheduleImportRejectedError(errors);
  return schedule;
}
