import { describe, expect, it } from "vitest";
import { dateToX, pixelsPerDay, taskDateRange, timelineEnd, timelineOrigin, xToDate } from "./timescale";

describe("timelineOrigin", () => {
  it("picks a week before the earliest task start", () => {
    const origin = timelineOrigin([{ plannedStart: "2026-02-01", earlyStart: null }, { plannedStart: "2026-01-10", earlyStart: null }]);
    expect(origin.toISOString().slice(0, 10)).toBe("2026-01-03");
  });

  it("falls back to earlyStart when plannedStart is missing", () => {
    const origin = timelineOrigin([{ plannedStart: null, earlyStart: "2026-01-10" }]);
    expect(origin.toISOString().slice(0, 10)).toBe("2026-01-03");
  });

  it("returns a sane default when there are no dated tasks", () => {
    expect(() => timelineOrigin([{ plannedStart: null, earlyStart: null }])).not.toThrow();
  });
});

describe("dateToX / xToDate", () => {
  it("round-trips a date through x and back at every zoom level", () => {
    const origin = new Date("2026-01-01T00:00:00.000Z");
    const date = new Date("2026-03-15T00:00:00.000Z");
    for (const zoom of ["day", "week", "month", "quarter", "year"] as const) {
      const x = dateToX(date, origin, zoom);
      const back = xToDate(x, origin, zoom);
      expect(Math.abs(back.getTime() - date.getTime())).toBeLessThan(1000); // sub-second float rounding only
    }
  });

  it("increasing zoom-in (day) spaces dates further apart than zooming out (year)", () => {
    const origin = new Date("2026-01-01T00:00:00.000Z");
    const date = new Date("2026-02-01T00:00:00.000Z");
    expect(dateToX(date, origin, "day")).toBeGreaterThan(dateToX(date, origin, "year"));
  });

  it("pixelsPerDay is positive and monotonically decreasing from day to year", () => {
    const levels = ["day", "week", "month", "quarter", "year"] as const;
    const values = levels.map(pixelsPerDay);
    for (const v of values) expect(v).toBeGreaterThan(0);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]!);
    }
  });
});

describe("taskDateRange", () => {
  it("uses planned dates when present", () => {
    const range = taskDateRange({ plannedStart: "2026-01-01", plannedFinish: "2026-01-05", earlyStart: "2026-02-01", earlyFinish: "2026-02-05" });
    expect(range?.start.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(range?.finish.toISOString().slice(0, 10)).toBe("2026-01-05");
  });

  it("falls back to early dates when planned dates are missing", () => {
    const range = taskDateRange({ plannedStart: null, plannedFinish: null, earlyStart: "2026-02-01", earlyFinish: "2026-02-05" });
    expect(range?.start.toISOString().slice(0, 10)).toBe("2026-02-01");
  });

  it("returns null when neither is available", () => {
    expect(taskDateRange({ plannedStart: null, plannedFinish: null, earlyStart: null, earlyFinish: null })).toBeNull();
  });

  it("returns null when only one side of the range is available", () => {
    expect(taskDateRange({ plannedStart: "2026-01-01", plannedFinish: null, earlyStart: null, earlyFinish: null })).toBeNull();
  });
});

describe("timelineEnd", () => {
  it("picks a week after the latest task finish", () => {
    const end = timelineEnd([{ plannedFinish: "2026-01-10", earlyFinish: null }, { plannedFinish: "2026-02-01", earlyFinish: null }]);
    expect(end.toISOString().slice(0, 10)).toBe("2026-02-08");
  });

  it("falls back to earlyFinish when plannedFinish is missing", () => {
    const end = timelineEnd([{ plannedFinish: null, earlyFinish: "2026-01-10" }]);
    expect(end.toISOString().slice(0, 10)).toBe("2026-01-17");
  });
});
