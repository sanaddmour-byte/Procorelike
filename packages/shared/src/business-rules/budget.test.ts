import { describe, expect, it } from "vitest";
import { computeProjectedAmount, computeRevisedBudget, computeVariance } from "./budget";

describe("budget math", () => {
  it("revised budget is original plus approved changes", () => {
    expect(computeRevisedBudget(100000, 5000)).toBe(105000);
  });

  it("projected amount adds forecast-to-complete on top of the revised budget", () => {
    expect(computeProjectedAmount(100000, 5000, 2000)).toBe(107000);
  });

  it("handles zero changes and zero forecast", () => {
    expect(computeProjectedAmount(50000, 0, 0)).toBe(50000);
  });

  it("variance is revised budget minus projected amount (negative means over budget)", () => {
    expect(computeVariance(105000, 107000)).toBe(-2000);
    expect(computeVariance(105000, 100000)).toBe(5000);
  });

  it("rounds to two decimal places to avoid floating-point drift", () => {
    expect(computeProjectedAmount(10.1, 0.2, 0.05)).toBeCloseTo(10.35, 2);
  });
});
