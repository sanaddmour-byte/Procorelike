import { describe, expect, it } from "vitest";
import { formatMoney } from "./format-money";

describe("formatMoney", () => {
  it("formats a USD amount in en with the dollar sign", () => {
    expect(formatMoney(1234.5, "USD", "en")).toBe("$1,234.50");
  });

  it("formats a string amount the same as a numeric one", () => {
    expect(formatMoney("1234.5", "USD", "en")).toBe(formatMoney(1234.5, "USD", "en"));
  });

  it("always renders two decimal places", () => {
    expect(formatMoney(10, "USD", "en")).toBe("$10.00");
  });

  it("respects a non-USD currency code", () => {
    expect(formatMoney(100, "JOD", "en")).toContain("JOD");
  });

  it("returns an em dash for null/undefined", () => {
    expect(formatMoney(null, "USD", "en")).toBe("—");
    expect(formatMoney(undefined, "USD", "en")).toBe("—");
  });

  it("returns an em dash for a non-numeric string", () => {
    expect(formatMoney("not-a-number", "USD", "en")).toBe("—");
  });

  it("formats in the Arabic locale without throwing", () => {
    expect(() => formatMoney(1234.5, "USD", "ar")).not.toThrow();
    expect(formatMoney(1234.5, "USD", "ar").length).toBeGreaterThan(0);
  });
});
