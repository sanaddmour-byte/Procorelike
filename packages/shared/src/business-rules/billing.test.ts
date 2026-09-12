import { describe, expect, it } from "vitest";
import { computeLineAmounts, sumNetThisPeriod } from "./billing";

describe("progress billing math", () => {
  it("computes this-period amount as the delta between cumulative percentages", () => {
    const line = computeLineAmounts(100000, 20, 50, 10);
    expect(line.completedPrevious).toBe(20000);
    expect(line.completedToDate).toBe(50000);
    expect(line.amountThisPeriod).toBe(30000);
  });

  it("withholds retention on the this-period amount, not the full completed-to-date amount", () => {
    const line = computeLineAmounts(100000, 20, 50, 10);
    // retention to date = 5000, retention previous = 2000, retention this period = 3000
    expect(line.retentionToDate).toBe(5000);
    expect(line.retentionThisPeriod).toBe(3000);
    expect(line.netThisPeriod).toBe(27000);
  });

  it("first application (0% previous) bills the full to-date amount this period", () => {
    const line = computeLineAmounts(50000, 0, 25, 5);
    expect(line.completedPrevious).toBe(0);
    expect(line.amountThisPeriod).toBe(12500);
    expect(line.retentionThisPeriod).toBe(625);
    expect(line.netThisPeriod).toBe(11875);
  });

  it("zero retention passes the full this-period amount through", () => {
    const line = computeLineAmounts(10000, 0, 100, 0);
    expect(line.netThisPeriod).toBe(10000);
  });

  it("sums net-this-period across multiple lines", () => {
    const lines = [computeLineAmounts(100000, 20, 50, 10), computeLineAmounts(50000, 0, 25, 5)];
    expect(sumNetThisPeriod(lines)).toBe(38875);
  });
});
