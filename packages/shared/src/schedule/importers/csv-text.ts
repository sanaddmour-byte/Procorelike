/**
 * A minimal, dependency-free RFC4180-ish CSV text parser -- deliberately
 * hand-rolled rather than pulling in a library (CLAUDE.md rule 10: no new
 * dependency without flagging cost first, and a plain-text format like
 * CSV doesn't need one). Handles quoted fields, embedded commas/newlines
 * inside quotes, and escaped quotes ("" inside a quoted field).
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  function endField(): void {
    row.push(field);
    field = "";
  }
  function endRow(): void {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < normalized.length) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  // Final field/row, unless the file ended cleanly with nothing pending.
  if (field.length > 0 || row.length > 0) {
    endRow();
  }
  // Drop a single trailing all-empty row caused by a final newline.
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === "") {
    rows.pop();
  }
  return rows;
}
