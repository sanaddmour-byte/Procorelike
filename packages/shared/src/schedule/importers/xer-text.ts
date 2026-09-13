/**
 * Primavera P6's XER format is a tab-delimited flat file with named
 * tables: a line starting `%T\t<TableName>` opens a table, `%F\t...`
 * (tab-separated) names its columns, each `%R\t...` is one row in that
 * table's column order, and `%E` ends the file. This parses that shape
 * into a generic `{ [tableName]: Array<Record<column, value>> }` map --
 * dependency-free (it's plain tab-delimited text, no library needed),
 * with no opinion yet about what PROJECT/TASK/TASKPRED/CALENDAR/PROJWBS
 * mean (that's ./p6-xer.ts).
 */
export type XerTables = Record<string, Array<Record<string, string>>>;

export function parseXerText(text: string): XerTables {
  const tables: XerTables = {};
  let currentTable: string | null = null;
  let currentFields: string[] = [];

  const lines = text.split(/\r\n|\r|\n/);
  for (const line of lines) {
    if (!line) continue;
    const parts = line.split("\t");
    const tag = parts[0];
    if (tag === "%T") {
      currentTable = parts[1] ?? null;
      if (currentTable && !tables[currentTable]) tables[currentTable] = [];
      currentFields = [];
    } else if (tag === "%F") {
      currentFields = parts.slice(1);
    } else if (tag === "%R") {
      if (!currentTable) continue;
      const values = parts.slice(1);
      const row: Record<string, string> = {};
      currentFields.forEach((field, i) => {
        row[field] = values[i] ?? "";
      });
      tables[currentTable]!.push(row);
    }
    // %E (end) and ERMHDR (the file header line) carry nothing this importer needs.
  }
  return tables;
}
