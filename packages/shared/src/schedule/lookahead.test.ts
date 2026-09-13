import { describe, expect, it } from "vitest";
import { computePpc, filterLookaheadWindow, type LookaheadTask, type PpcCommitment } from "./lookahead";

function task(overrides: Partial<LookaheadTask> & { id: string }): LookaheadTask {
  return { plannedStart: null, plannedFinish: null, earlyStart: null, earlyFinish: null, ...overrides };
}

describe("filterLookaheadWindow", () => {
  const window = { weekStart: "2026-02-01", horizonWeeks: 3 }; // 2026-02-01 .. 2026-02-22

  it("includes a task fully inside the window", () => {
    const t = task({ id: "1", plannedStart: "2026-02-05", plannedFinish: "2026-02-10" });
    expect(filterLookaheadWindow([t], window)).toEqual([t]);
  });

  it("includes a task that starts before but finishes inside the window", () => {
    const t = task({ id: "1", plannedStart: "2026-01-20", plannedFinish: "2026-02-05" });
    expect(filterLookaheadWindow([t], window)).toEqual([t]);
  });

  it("includes a task that starts inside but finishes after the window", () => {
    const t = task({ id: "1", plannedStart: "2026-02-20", plannedFinish: "2026-03-05" });
    expect(filterLookaheadWindow([t], window)).toEqual([t]);
  });

  it("excludes a task entirely before the window", () => {
    const t = task({ id: "1", plannedStart: "2026-01-01", plannedFinish: "2026-01-10" });
    expect(filterLookaheadWindow([t], window)).toEqual([]);
  });

  it("excludes a task entirely after the window", () => {
    const t = task({ id: "1", plannedStart: "2026-03-01", plannedFinish: "2026-03-10" });
    expect(filterLookaheadWindow([t], window)).toEqual([]);
  });

  it("falls back to early dates when planned dates are missing", () => {
    const t = task({ id: "1", earlyStart: "2026-02-05", earlyFinish: "2026-02-10" });
    expect(filterLookaheadWindow([t], window)).toEqual([t]);
  });

  it("excludes an unscheduled task (no dates at all)", () => {
    const t = task({ id: "1" });
    expect(filterLookaheadWindow([t], window)).toEqual([]);
  });
});

describe("computePpc", () => {
  function commitment(overrides: Partial<PpcCommitment>): PpcCommitment {
    return { committedByCompanyId: "acme", promisedFinish: "2026-02-01", actualFinish: null, ...overrides };
  }

  it("counts a commitment finished on or before the promised date as met", () => {
    const result = computePpc([commitment({ promisedFinish: "2026-02-01", actualFinish: "2026-01-30" })], "2026-02-15");
    expect(result).toEqual([{ companyId: "acme", met: 1, missed: 0, pending: 0, ppcPercent: 100 }]);
  });

  it("counts a due commitment finished late as missed", () => {
    const result = computePpc([commitment({ promisedFinish: "2026-02-01", actualFinish: "2026-02-05" })], "2026-02-15");
    expect(result).toEqual([{ companyId: "acme", met: 0, missed: 1, pending: 0, ppcPercent: 0 }]);
  });

  it("counts a due commitment with no actual finish yet as missed", () => {
    const result = computePpc([commitment({ promisedFinish: "2026-02-01", actualFinish: null })], "2026-02-15");
    expect(result).toEqual([{ companyId: "acme", met: 0, missed: 1, pending: 0, ppcPercent: 0 }]);
  });

  it("excludes a not-yet-due commitment from the ratio", () => {
    const result = computePpc([commitment({ promisedFinish: "2026-03-01", actualFinish: null })], "2026-02-15");
    expect(result).toEqual([{ companyId: "acme", met: 0, missed: 0, pending: 1, ppcPercent: null }]);
  });

  it("computes a mixed ratio and groups by company independently", () => {
    const result = computePpc(
      [
        commitment({ committedByCompanyId: "acme", promisedFinish: "2026-02-01", actualFinish: "2026-01-30" }),
        commitment({ committedByCompanyId: "acme", promisedFinish: "2026-02-01", actualFinish: "2026-02-05" }),
        commitment({ committedByCompanyId: "acme", promisedFinish: "2026-03-01", actualFinish: null }),
        commitment({ committedByCompanyId: "beta", promisedFinish: "2026-02-01", actualFinish: "2026-01-15" }),
      ],
      "2026-02-15",
    );
    const acme = result.find((r) => r.companyId === "acme")!;
    const beta = result.find((r) => r.companyId === "beta")!;
    expect(acme).toEqual({ companyId: "acme", met: 1, missed: 1, pending: 1, ppcPercent: 50 });
    expect(beta).toEqual({ companyId: "beta", met: 1, missed: 0, pending: 0, ppcPercent: 100 });
  });

  it("returns an empty array for no commitments", () => {
    expect(computePpc([], "2026-02-15")).toEqual([]);
  });
});
