import { describe, expect, it } from "vitest";
import { formatGeneratedPunchItemDescription, shouldGeneratePunchItem } from "./inspection-punch";
import type { InspectionResponseValue } from "../schemas/inspection.schema";

describe("shouldGeneratePunchItem", () => {
  it("generates for a failed pass_fail response", () => {
    const value: InspectionResponseValue = { type: "pass_fail", passed: false };
    expect(shouldGeneratePunchItem(value)).toBe(true);
  });

  it("does not generate for a passing pass_fail response", () => {
    const value: InspectionResponseValue = { type: "pass_fail", passed: true };
    expect(shouldGeneratePunchItem(value)).toBe(false);
  });

  it("does not generate for na, numeric, photo, or signature responses", () => {
    const values: InspectionResponseValue[] = [
      { type: "na" },
      { type: "numeric", number: 42 },
      { type: "photo", attachmentId: "11111111-1111-1111-1111-111111111111" },
      { type: "signature", signedByName: "Jane Doe" },
    ];
    for (const value of values) {
      expect(shouldGeneratePunchItem(value)).toBe(false);
    }
  });
});

describe("formatGeneratedPunchItemDescription", () => {
  it("includes both the failed prompt and the inspection title", () => {
    const description = formatGeneratedPunchItemDescription("Fire extinguisher present and charged", "Weekly Safety Walk");
    expect(description).toContain("Fire extinguisher present and charged");
    expect(description).toContain("Weekly Safety Walk");
  });
});
