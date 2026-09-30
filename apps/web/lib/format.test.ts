import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatNumber, humanize } from "./format";

describe("format", () => {
  it("renders dates as YYYY-MM-DD in every locale", () => {
    expect(formatDate("2026-09-30")).toBe("2026-09-30");
    expect(formatDate(new Date(2026, 8, 3))).toBe("2026-09-03");
    expect(formatDate(null)).toBe("");
  });
  it("renders date-times without seconds", () => {
    expect(formatDateTime(new Date(2026, 8, 3, 7, 5))).toBe("2026-09-03 07:05");
  });
  it("uses Western digits for Arabic", () => {
    expect(formatNumber(1234, "ar")).toMatch(/^1.?234$/);
  });
  it("humanizes enum keys", () => {
    expect(humanize("ready_for_review")).toBe("Ready for review");
  });
});
