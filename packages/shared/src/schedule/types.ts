/**
 * The one internal shape every schedule importer (MS Project XML, P6
 * XER, P6 XML, CSV/XLSX -- docs/SCHEDULING.md A1) normalises to. Each
 * importer is a pure function: `(fileContents: string) => ParsedSchedule`.
 * No database access, no I/O beyond reading the string it's handed.
 *
 * Calendar-aware CPM date math (workingTimeAdd/workingTimeBetween) and the
 * computeSchedule() engine (docs/SCHEDULING.md A4) are Tier B / Phase 11d
 * scope, not built here -- Tier A only imports and displays a schedule
 * that already carries its source tool's own computed dates/float, it
 * doesn't recompute them.
 */

export type ScheduleSourceTool = "ms_project_xml" | "p6_xer" | "p6_xml" | "csv";

export type ParsedTaskType = "task" | "summary" | "milestone" | "loe" | "wbs";

export type ParsedConstraintType = "asap" | "alap" | "snet" | "snlt" | "fnet" | "fnlt" | "mso" | "mfo";

export type ParsedDependencyType = "FS" | "SS" | "FF" | "SF";

export interface ParsedCalendarException {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  isWorking: boolean;
  workingMinutes?: number;
  label?: string;
}

export interface ParsedCalendar {
  /** The source format's own calendar id, e.g. P6's clndr_id. Used to resolve ParsedTask.calendarExternalId. */
  externalId: string;
  name: string;
  hoursPerDay: number;
  /** Bitmask, bit 0 = Sunday ... bit 6 = Saturday. */
  workingDays: number;
  isDefault: boolean;
  exceptions: ParsedCalendarException[];
}

export interface ParsedTask {
  /**
   * The source format's own task id (P6 task_id/GUID, MSP Task UID). Every
   * importer must populate this -- it's the primary key a re-import diff
   * matches on (docs/SCHEDULING.md A2), before falling back to wbsCode
   * then fuzzy name matching.
   */
  externalId: string;
  wbsCode?: string;
  /** externalId of the parent WBS/summary task, if any. */
  parentExternalId?: string;
  name: string;
  taskType: ParsedTaskType;
  durationMinutes?: number;
  calendarExternalId?: string;
  /** ISO date or datetime, as the source format provides it. */
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;
  plannedStart?: string;
  plannedFinish?: string;
  actualStart?: string;
  actualFinish?: string;
  totalFloatMinutes?: number;
  freeFloatMinutes?: number;
  isCritical?: boolean;
  percentComplete: number;
  physicalPercentComplete?: number;
  constraintType?: ParsedConstraintType;
  constraintDate?: string;
  sortOrder: number;
}

export interface ParsedDependency {
  predecessorExternalId: string;
  successorExternalId: string;
  type: ParsedDependencyType;
  lagMinutes: number;
}

export interface ParsedSchedule {
  sourceTool: ScheduleSourceTool;
  /** The project/schedule name as the source file names it, for display only. */
  name?: string;
  /** ISO date -- the file's data date / status date. All progress logic keys off this (docs/SCHEDULING.md A2). */
  dataDate: string;
  calendars: ParsedCalendar[];
  tasks: ParsedTask[];
  dependencies: ParsedDependency[];
  /** Non-fatal issues found while parsing (e.g. a row skipped for a missing required field) -- surfaced to the importing user, never silently dropped. */
  warnings: string[];
}

export interface ScheduleImportError {
  code: "circular_dependency" | "orphaned_predecessor" | "negative_duration" | "malformed_file";
  message: string;
  /** externalIds of the tasks involved, when applicable (e.g. the full cycle chain). */
  taskExternalIds?: string[];
}

/** Thrown by an importer when the file can't be turned into a usable ParsedSchedule at all. */
export class ScheduleImportRejectedError extends Error {
  constructor(public readonly errors: ScheduleImportError[]) {
    super(errors.map((e) => e.message).join("; "));
    this.name = "ScheduleImportRejectedError";
  }
}
