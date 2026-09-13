import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ParsedCalendar, ParsedDependency, ParsedDependencyType, ParsedSchedule, ParsedTask } from "../types";
import { ScheduleImportRejectedError } from "../types";
import { validateParsedSchedule } from "../validate";

/**
 * Parses Primavera P6's native XML export (APIBusinessObjects) -- element
 * names below follow P6's real convention of an internal `ObjectId`
 * primary key plus `<Entity>ObjectId` foreign keys (Activity/WBSObjectId,
 * Relationship/PredecessorActivityObjectId, etc.), reconstructed from
 * memory; validate against a real P6 XML export if a field doesn't match.
 *
 * Same clndr_data-equivalent scope cut as the XER importer: P6 XML's
 * <StandardWorkWeek> per-day-of-week hour ranges aren't parsed here,
 * every calendar defaults to Sun-Thu working.
 */

const RELATIONSHIP_TYPE_MAP: Record<string, ParsedDependencyType> = {
  "Finish to Start": "FS",
  "Start to Start": "SS",
  "Finish to Finish": "FF",
  "Start to Finish": "SF",
  FS: "FS",
  SS: "SS",
  FF: "FF",
  SF: "SF",
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface P6XmlActivity {
  ObjectId: string | number;
  Id?: string;
  Name: string;
  Type?: string;
  WBSObjectId?: string | number;
  CalendarObjectId?: string | number;
  PlannedDuration?: number;
  StartDate?: string;
  FinishDate?: string;
  EarlyStartDate?: string;
  EarlyFinishDate?: string;
  LateStartDate?: string;
  LateFinishDate?: string;
  ActualStartDate?: string;
  ActualFinishDate?: string;
  TotalFloat?: number;
  FreeFloat?: number;
  PercentComplete?: number;
  PhysicalPercentComplete?: number;
}
interface P6XmlWbs {
  ObjectId: string | number;
  Name: string;
  Code?: string;
  ParentObjectId?: string | number;
}
interface P6XmlCalendar {
  ObjectId: string | number;
  Name: string;
  IsDefault?: boolean;
}
interface P6XmlRelationship {
  PredecessorActivityObjectId: string | number;
  SuccessorActivityObjectId: string | number;
  Type?: string;
  Lag?: number;
}
interface P6XmlDoc {
  APIBusinessObjects?: {
    Project?: { ObjectId?: string | number; Name?: string; DataDate?: string };
    Calendar?: P6XmlCalendar | P6XmlCalendar[];
    WBS?: P6XmlWbs | P6XmlWbs[];
    Activity?: P6XmlActivity | P6XmlActivity[];
    Relationship?: P6XmlRelationship | P6XmlRelationship[];
  };
}

export function parseP6Xml(xmlText: string): ParsedSchedule {
  const validation = XMLValidator.validate(xmlText);
  if (validation !== true) {
    throw new ScheduleImportRejectedError([{ code: "malformed_file", message: `Could not parse XML: ${validation.err.msg}` }]);
  }

  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });
  let doc: P6XmlDoc;
  try {
    doc = parser.parse(xmlText) as P6XmlDoc;
  } catch (err) {
    throw new ScheduleImportRejectedError([
      { code: "malformed_file", message: `Could not parse XML: ${err instanceof Error ? err.message : String(err)}` },
    ]);
  }

  const root = doc.APIBusinessObjects;
  if (!root) {
    throw new ScheduleImportRejectedError([
      { code: "malformed_file", message: "Not a recognisable P6 XML file (missing <APIBusinessObjects>)" },
    ]);
  }

  const calendars: ParsedCalendar[] = asArray(root.Calendar).map((cal) => ({
    externalId: String(cal.ObjectId),
    name: cal.Name,
    hoursPerDay: 8,
    workingDays: 0b0011111,
    isDefault: cal.IsDefault === true,
    exceptions: [],
  }));

  const wbsNodes: ParsedTask[] = asArray(root.WBS).map((wbs, i) => ({
    externalId: `wbs:${wbs.ObjectId}`,
    wbsCode: wbs.Code,
    parentExternalId: wbs.ParentObjectId !== undefined ? `wbs:${wbs.ParentObjectId}` : undefined,
    name: wbs.Name,
    taskType: "wbs",
    percentComplete: 0,
    sortOrder: i,
  }));

  const activities: ParsedTask[] = asArray(root.Activity).map((act, i) => {
    const totalFloatMinutes = act.TotalFloat !== undefined ? Math.round(act.TotalFloat * 60) : undefined;
    return {
      externalId: String(act.ObjectId),
      wbsCode: act.Id,
      parentExternalId: act.WBSObjectId !== undefined ? `wbs:${act.WBSObjectId}` : undefined,
      name: act.Name,
      taskType: act.Type === "Milestone" || act.Type === "Start Milestone" || act.Type === "Finish Milestone" ? "milestone" : "task",
      durationMinutes: act.PlannedDuration !== undefined ? Math.round(act.PlannedDuration * 60) : undefined,
      calendarExternalId: act.CalendarObjectId !== undefined ? String(act.CalendarObjectId) : undefined,
      plannedStart: act.StartDate,
      plannedFinish: act.FinishDate,
      earlyStart: act.EarlyStartDate,
      earlyFinish: act.EarlyFinishDate,
      lateStart: act.LateStartDate,
      lateFinish: act.LateFinishDate,
      actualStart: act.ActualStartDate,
      actualFinish: act.ActualFinishDate,
      totalFloatMinutes,
      freeFloatMinutes: act.FreeFloat !== undefined ? Math.round(act.FreeFloat * 60) : undefined,
      isCritical: totalFloatMinutes !== undefined ? totalFloatMinutes <= 0 : false,
      percentComplete: act.PercentComplete ?? 0,
      physicalPercentComplete: act.PhysicalPercentComplete,
      sortOrder: wbsNodes.length + i,
    };
  });

  const dependencies: ParsedDependency[] = asArray(root.Relationship).map((rel) => ({
    predecessorExternalId: String(rel.PredecessorActivityObjectId),
    successorExternalId: String(rel.SuccessorActivityObjectId),
    type: (rel.Type && RELATIONSHIP_TYPE_MAP[rel.Type]) || "FS",
    lagMinutes: rel.Lag !== undefined ? Math.round(rel.Lag * 60) : 0,
  }));

  const schedule: ParsedSchedule = {
    sourceTool: "p6_xml",
    name: root.Project?.Name,
    dataDate: (root.Project?.DataDate ?? new Date().toISOString()).slice(0, 10),
    calendars,
    tasks: [...wbsNodes, ...activities],
    dependencies,
    warnings: [],
  };

  const errors = validateParsedSchedule(schedule);
  if (errors.length > 0) throw new ScheduleImportRejectedError(errors);
  return schedule;
}
