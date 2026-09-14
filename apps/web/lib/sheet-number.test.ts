import { describe, expect, it } from "vitest";
import { extractSheetNumber } from "./sheet-number";

describe("extractSheetNumber", () => {
  it("finds a hyphenated sheet number", () => {
    expect(extractSheetNumber("GENERAL NOTES\nSHEET A-101\nSCALE 1:100")).toBe("A-101");
  });

  it("finds a sheet number with no separator", () => {
    expect(extractSheetNumber("STRUCTURAL FRAMING PLAN S201")).toBe("S-201");
  });

  it("prefers the last match, matching a title block near the bottom of OCR'd text", () => {
    expect(extractSheetNumber("PROJECT NO 2024-01\nFLOOR PLAN\nSHEET NUMBER: A-102")).toBe("A-102");
  });

  it("handles a decimal sub-sheet suffix", () => {
    expect(extractSheetNumber("DETAIL SHEET A-501.2")).toBe("A-501.2");
  });

  it("returns null when nothing resembling a sheet number is present", () => {
    expect(extractSheetNumber("this is just some garbled ocr noise")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(extractSheetNumber("")).toBeNull();
  });
});
