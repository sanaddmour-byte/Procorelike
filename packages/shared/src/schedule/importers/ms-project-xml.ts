import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ParsedCalendar, ParsedConstraintType, ParsedDependency, ParsedDependencyType, ParsedSchedule, ParsedTask } from "../types";
import { ScheduleImportRejectedError } from "../types";
import { validateParsedSchedule } from "../validate";

/**
 * Parses the MS Project XML export format (Project/Tasks/Task,
 * Project/Calendars/Calendar) -- the primary required import path
 * (docs/SCHEDULING.md A1). Field names and enum codes below follow the
 * published Microsoft Project XML schema from memory; if a real MSP
 * export behaves differently on some edge case, that's the place to
 * check first rather than assuming this parser's logic is wrong.
 */

// MSP's PredecessorLink/Type: 0=FF, 1=FS, 2=SF, 3=SS.
const DEPENDENCY_TYPE_BY_CODE: Record<number, ParsedDependencyType> = { 0: "FF", 1: "FS", 2: "SF", 3: "SS" };

// MSP's Task/ConstraintType: 0=ASAP, 1=ALAP, 2=MSO, 3=MFO, 4=SNET, 5=SNLT, 6=FNET, 7=FNLT.
const CONSTRAINT_TYPE_BY_CODE: Record<number, ParsedConstraintType> = {
  0: "asap",
  1: "alap",
  2: "mso",
  3: "mfo",
  4: "snet",
  5: "snlt",
  6: "fnet",
  7: "fnlt",
};

// MSP's WeekDay/DayType: 1=Sunday ... 7=Saturday. Our bitmask is bit 0 = Sunday ... bit 6 = Saturday.
function dayTypeToBit(dayType: number): number {
  return 1 << (dayType - 1);
}

/** MSP durations are ISO 8601-ish, e.g. "PT48H0M0S". Returns minutes. */
function parseMspDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 60 + minutes + Math.round(seconds / 60);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface MspWeekDay {
  DayType: number;
  DayWorking: number;
}
interface MspCalendar {
  UID: number | string;
  Name: string;
  IsBaseCalendar?: number;
  WeekDays?: { WeekDay?: MspWeekDay | MspWeekDay[] };
}
interface MspPredecessorLink {
  PredecessorUID: number | string;
  Type?: number;
  LinkLag?: number;
}
interface MspTask {
  UID: number | string;
  Name: string;
  WBS?: string;
  OutlineLevel?: number;
  Summary?: number;
  Milestone?: number;
  Start?: string;
  Finish?: string;
  ActualStart?: string;
  ActualFinish?: string;
  Duration?: string;
  PercentComplete?: number;
  PhysicalPercentComplete?: number;
  ConstraintType?: number;
  ConstraintDate?: string;
  CalendarUID?: number | string;
  Critical?: number;
  TotalSlack?: number;
  FreeSlack?: number;
  PredecessorLink?: MspPredecessorLink | MspPredecessorLink[];
}
interface MspProject {
  Project?: {
    Name?: string;
    StatusDate?: string;
    CurrentDate?: string;
    Calendars?: { Calendar?: MspCalendar | MspCalendar[] };
    Tasks?: { Task?: MspTask | MspTask[] };
  };
}

export function parseMsProjectXml(xmlText: string): ParsedSchedule {
  const validation = XMLValidator.validate(xmlText);
  if (validation !== true) {
    throw new ScheduleImportRejectedError([{ code: "malformed_file", message: `Could not parse XML: ${validation.err.msg}` }]);
  }

  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true, numberParseOptions: { leadingZeros: false, hex: false } });
  let doc: MspProject;
  try {
    doc = parser.parse(xmlText) as MspProject;
  } catch (err) {
    throw new ScheduleImportRejectedError([
      { code: "malformed_file", message: `Could not parse XML: ${err instanceof Error ? err.message : String(err)}` },
    ]);
  }

  const project = doc.Project;
  if (!project) {
    throw new ScheduleImportRejectedError([{ code: "malformed_file", message: "Not a recognisable MS Project XML file (missing <Project>)" }]);
  }

  const calendars: ParsedCalendar[] = asArray(project.Calendars?.Calendar).map((cal) => {
    const weekDays = asArray(cal.WeekDays?.WeekDay);
    let workingDays = 0;
    for (const wd of weekDays) {
      if (wd.DayWorking === 1) workingDays |= dayTypeToBit(wd.DayType);
    }
    return {
      externalId: String(cal.UID),
      name: cal.Name,
      hoursPerDay: 8,
      workingDays: workingDays || 0b0011111,
      isDefault: cal.IsBaseCalendar === 1,
      exceptions: [],
    };
  });

  const tasks: ParsedTask[] = [];
  const dependencies: ParsedDependency[] = [];
  const warnings: string[] = [];

  const mspTasks = asArray(project.Tasks?.Task);
  const outlineStack: { level: number; externalId: string }[] = [];

  for (const t of mspTasks) {
    if (String(t.UID) === "0") continue; // MSP's synthetic root/project-summary task
    const externalId = String(t.UID);
    const outlineLevel = t.OutlineLevel ?? 1;

    while (outlineStack.length > 0 && outlineStack[outlineStack.length - 1]!.level >= outlineLevel) {
      outlineStack.pop();
    }
    const parentExternalId = outlineStack.length > 0 ? outlineStack[outlineStack.length - 1]!.externalId : undefined;

    const durationMinutes = parseMspDuration(t.Duration);
    if (t.Duration && durationMinutes === undefined) {
      warnings.push(`Task "${t.Name}" (${externalId}): could not parse Duration "${t.Duration}"`);
    }

    tasks.push({
      externalId,
      wbsCode: t.WBS,
      parentExternalId,
      name: t.Name,
      taskType: t.Milestone === 1 ? "milestone" : t.Summary === 1 ? "summary" : "task",
      durationMinutes,
      calendarExternalId: t.CalendarUID !== undefined ? String(t.CalendarUID) : undefined,
      plannedStart: t.Start,
      plannedFinish: t.Finish,
      actualStart: t.ActualStart,
      actualFinish: t.ActualFinish,
      totalFloatMinutes: t.TotalSlack,
      freeFloatMinutes: t.FreeSlack,
      isCritical: t.Critical === 1,
      percentComplete: t.PercentComplete ?? 0,
      physicalPercentComplete: t.PhysicalPercentComplete,
      constraintType: t.ConstraintType !== undefined ? CONSTRAINT_TYPE_BY_CODE[t.ConstraintType] : undefined,
      constraintDate: t.ConstraintDate,
      sortOrder: tasks.length,
    });

    if (t.Summary === 1) outlineStack.push({ level: outlineLevel, externalId });

    for (const pred of asArray(t.PredecessorLink)) {
      const predUid = String(pred.PredecessorUID);
      if (predUid === "-1" || predUid === "0") continue; // no predecessor / project root
      dependencies.push({
        predecessorExternalId: predUid,
        successorExternalId: externalId,
        type: pred.Type !== undefined ? (DEPENDENCY_TYPE_BY_CODE[pred.Type] ?? "FS") : "FS",
        // LinkLag's real-world unit (tenths of a minute in some MSP exports)
        // isn't verifiable without a real sample file to check against;
        // treated as whole minutes here as a documented simplification.
        lagMinutes: Number(pred.LinkLag ?? 0),
      });
    }
  }

  const schedule: ParsedSchedule = {
    sourceTool: "ms_project_xml",
    name: project.Name,
    dataDate: (project.StatusDate ?? project.CurrentDate ?? new Date().toISOString()).slice(0, 10),
    calendars,
    tasks,
    dependencies,
    warnings,
  };

  const errors = validateParsedSchedule(schedule);
  if (errors.length > 0) throw new ScheduleImportRejectedError(errors);
  return schedule;
}
