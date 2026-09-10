/**
 * Pure formatting helpers for human-readable record numbers. The actual
 * next-value allocation is server-side only (a Postgres function against
 * `number_sequences`, row-locked per project — see docs/ARCHITECTURE.md §7).
 * These helpers exist so the format is defined once and testable without a
 * database, and so the DB layer and any display code agree on the shape.
 */

export function formatSequenceNumber(prefix: string, value: number, padLength = 4): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`formatSequenceNumber: value must be a positive integer, got ${value}`);
  }
  return `${prefix}-${String(value).padStart(padLength, "0")}`;
}

export function formatRfiNumber(value: number): string {
  return formatSequenceNumber("RFI", value, 4);
}

export function formatChangeOrderNumber(value: number): string {
  return formatSequenceNumber("CO", value, 3);
}

export function formatPunchItemNumber(value: number): string {
  return formatSequenceNumber("PI", value, 4);
}

/** e.g. formatSubmittalNumber("03.30.00", 2) => "SUB-03.30.00-002" */
export function formatSubmittalNumber(specSectionCode: string, value: number): string {
  return `SUB-${specSectionCode}-${String(value).padStart(3, "0")}`;
}
