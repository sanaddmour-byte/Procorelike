/**
 * Heuristic extraction of a construction-drawing sheet number (e.g. "A-101",
 * "S201", "M-100.1") from OCR'd title-block text. Real title blocks vary
 * wildly in layout, so this looks for the *last* match in the recognized
 * text -- title blocks are conventionally at the bottom-right of a sheet,
 * and OCR reads roughly top-to-bottom -- rather than the first, and
 * requires a letter-prefix + digit pattern to avoid matching stray numbers
 * (dimensions, page counts, dates) elsewhere on the sheet.
 */
const SHEET_NUMBER_PATTERN = /\b([A-Z]{1,3})[-.\s]?(\d{2,4}(?:\.\d{1,2})?)\b/g;

export function extractSheetNumber(text: string): string | null {
  const matches = [...text.matchAll(SHEET_NUMBER_PATTERN)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  return `${last[1]}-${last[2]}`;
}
