import type { ParsedDependency, ParsedSchedule, ParsedTask } from "../types";
import { validateParsedSchedule } from "../validate";
import { ScheduleImportRejectedError } from "../types";
import { parseCsvText } from "./csv-text";

/**
 * The guided column-mapping UI (docs/SCHEDULING.md A1 item 3, a Phase 11b
 * concern) lets a user tell the importer which spreadsheet column means
 * what; this is the shape it produces. Every field maps to a column
 * header string, or is left undefined if the sheet doesn't have it.
 */
export interface CsvColumnMapping {
  id: string;
  name: string;
  wbsCode?: string;
  parentId?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: string;
  percentComplete?: string;
  /** Comma or semicolon-separated list of predecessor task ids -- every listed predecessor becomes a Finish-to-Start dependency with zero lag, since a plain task list has no way to express lag or dependency type. */
  predecessors?: string;
}

const DEFAULT_HEADER_SYNONYMS: Record<keyof CsvColumnMapping, string[]> = {
  id: ["id", "task id", "activity id", "external id"],
  name: ["name", "task name", "activity name", "description"],
  wbsCode: ["wbs", "wbs code"],
  parentId: ["parent id", "parent", "summary id"],
  startDate: ["start", "start date", "planned start"],
  endDate: ["finish", "end", "end date", "finish date", "planned finish"],
  durationDays: ["duration", "duration (days)", "days"],
  percentComplete: ["% complete", "percent complete", "pct complete", "% done"],
  predecessors: ["predecessors", "predecessor", "predecessor ids"],
};

/** Case-insensitive header match against the sheet's actual header row, falling back to common synonyms when no explicit mapping is supplied. */
function resolveMapping(headers: string[], explicit?: Partial<CsvColumnMapping>): CsvColumnMapping {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());
  function findColumn(field: keyof CsvColumnMapping): string | undefined {
    const explicitValue = explicit?.[field];
    if (explicitValue) return explicitValue;
    const synonyms = DEFAULT_HEADER_SYNONYMS[field];
    const idx = normalizedHeaders.findIndex((h) => synonyms.includes(h));
    return idx === -1 ? undefined : headers[idx];
  }

  const id = findColumn("id");
  const name = findColumn("name");
  if (!id || !name) {
    throw new Error(
      `CSV import: could not find required columns (id, name) in header row [${headers.join(", ")}]. Pass an explicit columnMapping.`,
    );
  }
  return {
    id,
    name,
    wbsCode: findColumn("wbsCode"),
    parentId: findColumn("parentId"),
    startDate: findColumn("startDate"),
    endDate: findColumn("endDate"),
    durationDays: findColumn("durationDays"),
    percentComplete: findColumn("percentComplete"),
    predecessors: findColumn("predecessors"),
  };
}

/**
 * Converts already-tabular rows (a parsed CSV, or an XLSX sheet's rows --
 * XLSX binary decoding happens at the API layer, outside this pure
 * function, see docs/ROADMAP.md's Phase 11a gate report) into a
 * ParsedSchedule. The first row is always the header row.
 */
export function parseScheduleRows(
  rows: string[][],
  options: { dataDate: string; columnMapping?: Partial<CsvColumnMapping> } ,
): ParsedSchedule {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    throw new ScheduleImportRejectedError([{ code: "malformed_file", message: "CSV/XLSX file has no header row" }]);
  }
  const mapping = resolveMapping(headerRow, options.columnMapping);
  const colIndex = (header: string | undefined): number => (header ? headerRow.indexOf(header) : -1);

  const idIdx = colIndex(mapping.id);
  const nameIdx = colIndex(mapping.name);
  const wbsIdx = colIndex(mapping.wbsCode);
  const parentIdx = colIndex(mapping.parentId);
  const startIdx = colIndex(mapping.startDate);
  const endIdx = colIndex(mapping.endDate);
  const durationIdx = colIndex(mapping.durationDays);
  const pctIdx = colIndex(mapping.percentComplete);
  const predecessorsIdx = colIndex(mapping.predecessors);

  const tasks: ParsedTask[] = [];
  const dependencies: ParsedDependency[] = [];
  const warnings: string[] = [];

  dataRows.forEach((row, rowNumber) => {
    if (row.every((cell) => cell.trim() === "")) return; // skip blank rows
    const externalId = row[idIdx]?.trim();
    const name = row[nameIdx]?.trim();
    if (!externalId || !name) {
      warnings.push(`Row ${rowNumber + 2}: skipped, missing required id or name`);
      return;
    }

    const durationDaysRaw = durationIdx >= 0 ? row[durationIdx]?.trim() : undefined;
    const durationDays = durationDaysRaw ? Number(durationDaysRaw) : undefined;

    const pctRaw = pctIdx >= 0 ? row[pctIdx]?.trim().replace("%", "") : undefined;
    const percentComplete = pctRaw ? Number(pctRaw) : 0;

    tasks.push({
      externalId,
      name,
      taskType: "task",
      wbsCode: wbsIdx >= 0 ? row[wbsIdx]?.trim() || undefined : undefined,
      parentExternalId: parentIdx >= 0 ? row[parentIdx]?.trim() || undefined : undefined,
      plannedStart: startIdx >= 0 ? row[startIdx]?.trim() || undefined : undefined,
      plannedFinish: endIdx >= 0 ? row[endIdx]?.trim() || undefined : undefined,
      durationMinutes: durationDays !== undefined && !Number.isNaN(durationDays) ? durationDays * 24 * 60 : undefined,
      percentComplete: Number.isNaN(percentComplete) ? 0 : percentComplete,
      sortOrder: rowNumber,
    });

    if (predecessorsIdx >= 0) {
      const raw = row[predecessorsIdx]?.trim();
      if (raw) {
        for (const predId of raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
          dependencies.push({ predecessorExternalId: predId, successorExternalId: externalId, type: "FS", lagMinutes: 0 });
        }
      }
    }
  });

  const schedule: ParsedSchedule = {
    sourceTool: "csv",
    dataDate: options.dataDate,
    calendars: [],
    tasks,
    dependencies,
    warnings,
  };

  const errors = validateParsedSchedule(schedule);
  if (errors.length > 0) throw new ScheduleImportRejectedError(errors);
  return schedule;
}

export function parseCsvSchedule(csvText: string, options: { dataDate: string; columnMapping?: Partial<CsvColumnMapping> }): ParsedSchedule {
  const rows = parseCsvText(csvText);
  return parseScheduleRows(rows, options);
}
