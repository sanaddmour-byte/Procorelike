import type { InspectionResponseValue } from "../schemas/inspection.schema";

/**
 * A failed pass/fail checklist item auto-creates a linked punch item
 * (docs/DATA_MODEL.md §8: "A failed pass/fail item auto-creates a
 * punch_items row, linked back here"). Every other response type/outcome
 * never does — "na" and a passing "pass_fail" are not defects to track.
 */
export function shouldGeneratePunchItem(value: InspectionResponseValue): boolean {
  return value.type === "pass_fail" && value.passed === false;
}

/** The punch item's description, built from the failed checklist prompt so the punch list entry is self-explanatory without cross-referencing the inspection. */
export function formatGeneratedPunchItemDescription(templateItemPrompt: string, inspectionTitle: string): string {
  return `Failed inspection item: "${templateItemPrompt}" (${inspectionTitle})`;
}
