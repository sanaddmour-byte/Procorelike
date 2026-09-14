import { describe, expect, it } from "vitest";
import { dayWorkingMinutes, isWorkingDay, workingTimeAdd, workingTimeBetween, workingTimeSubtract, type CalendarInput } from "./calendar";

/** Sunday-Thursday working week, 8h/day, no exceptions -- the ar-JO default (docs/SCHEDULING.md A10: never default to Mon-Fri). */
const SUN_THU: CalendarInput = { hoursPerDay: 8, workingDays: 0b0011111, exceptions: [] };

/** Same week, but Sunday 2024-01-07 is an Eid holiday. */
const SUN_THU_WITH_EID: CalendarInput = {
  hoursPerDay: 8,
  workingDays: 0b0011111,
  exceptions: [{ date: "2024-01-07", isWorking: false }],
};

/** A classic Mon-Fri calendar, used only to prove the engine isn't hardcoded to Sun-Thu. */
const MON_FRI: CalendarInput = { hoursPerDay: 8, workingDays: 0b0111110, exceptions: [] };

// 2024-01-01 is a Monday, so: Jan 4 = Thu, Jan 5 = Fri, Jan 6 = Sat, Jan 7 = Sun, Jan 8 = Mon, Jan 9 = Tue.
const THU_8AM = new Date("2024-01-04T08:00:00Z");
const THU_4PM = new Date("2024-01-04T16:00:00Z");

describe("isWorkingDay / dayWorkingMinutes", () => {
  it("treats Sunday-Thursday as working on the ar-JO default calendar", () => {
    expect(isWorkingDay(SUN_THU, new Date("2024-01-07T08:00:00Z"))).toBe(true); // Sun
    expect(isWorkingDay(SUN_THU, new Date("2024-01-04T08:00:00Z"))).toBe(true); // Thu
  });

  it("treats Friday-Saturday as non-working on the ar-JO default calendar", () => {
    expect(isWorkingDay(SUN_THU, new Date("2024-01-05T08:00:00Z"))).toBe(false); // Fri
    expect(isWorkingDay(SUN_THU, new Date("2024-01-06T08:00:00Z"))).toBe(false); // Sat
  });

  it("does not default to Mon-Fri when a project explicitly configures it", () => {
    expect(isWorkingDay(MON_FRI, new Date("2024-01-07T08:00:00Z"))).toBe(false); // Sun
    expect(isWorkingDay(MON_FRI, new Date("2024-01-01T08:00:00Z"))).toBe(true); // Mon
  });

  it("an exception overrides the weekly pattern", () => {
    expect(dayWorkingMinutes(SUN_THU, "2024-01-07")).toBe(480);
    expect(dayWorkingMinutes(SUN_THU_WITH_EID, "2024-01-07")).toBe(0);
  });

  it("an exception can also mark a normally non-working day as working (a directed make-up Friday)", () => {
    const makeUpFriday: CalendarInput = { ...SUN_THU, exceptions: [{ date: "2024-01-05", isWorking: true, workingMinutes: 240 }] };
    expect(dayWorkingMinutes(makeUpFriday, "2024-01-05")).toBe(240);
  });
});

describe("workingTimeAdd", () => {
  it("stays within the same day when duration fits in the remaining window", () => {
    expect(workingTimeAdd(SUN_THU, THU_8AM, 480)).toEqual(THU_4PM);
  });

  it("skips Friday-Saturday, landing on Monday for a 3-day duration starting Thursday", () => {
    // Thu (480) -> Sun (480) -> Mon (480) = 1440 minutes total.
    expect(workingTimeAdd(SUN_THU, THU_8AM, 1440)).toEqual(new Date("2024-01-08T16:00:00Z"));
  });

  it("an Eid exception pushes the result by one further working day", () => {
    expect(workingTimeAdd(SUN_THU_WITH_EID, THU_8AM, 1440)).toEqual(new Date("2024-01-09T16:00:00Z"));
  });

  it("snaps a start that falls on a non-working day forward to the next working window", () => {
    // Friday 2024-01-05 is non-working; adding 0 minutes should snap to Sunday 08:00.
    expect(workingTimeAdd(SUN_THU, new Date("2024-01-05T10:00:00Z"), 0)).toEqual(new Date("2024-01-07T08:00:00Z"));
  });

  it("treats negative minutes as a subtraction (used for negative lag)", () => {
    expect(workingTimeAdd(SUN_THU, THU_4PM, -480)).toEqual(THU_8AM);
  });

  it("handles a multi-week span correctly (10 working days from a Sunday)", () => {
    // 10 working days = 2 full Sun-Thu weeks (Fri/Sat skipped each week).
    const start = new Date("2024-01-07T08:00:00Z"); // Sunday
    const result = workingTimeAdd(SUN_THU, start, 10 * 480);
    expect(result).toEqual(new Date("2024-01-18T16:00:00Z")); // second Thursday, end of day
  });
});

describe("workingTimeSubtract", () => {
  it("mirrors workingTimeAdd across the same span", () => {
    const finish = workingTimeAdd(SUN_THU, THU_8AM, 1440);
    expect(workingTimeSubtract(SUN_THU, finish, 1440)).toEqual(THU_8AM);
  });

  it("snaps a finish that falls on a non-working day backward to the previous working window", () => {
    // Saturday 2024-01-06 is non-working; subtracting 0 minutes should snap to Thursday 16:00.
    expect(workingTimeSubtract(SUN_THU, new Date("2024-01-06T10:00:00Z"), 0)).toEqual(THU_4PM);
  });
});

describe("workingTimeBetween", () => {
  it("counts only working minutes, excluding the weekend in between", () => {
    // Thu 08:00 -> Mon 16:00 spans Thu+Sun+Mon = 3 working days = 1440 minutes, skipping Fri/Sat entirely.
    expect(workingTimeBetween(SUN_THU, THU_8AM, new Date("2024-01-08T16:00:00Z"))).toBe(1440);
  });

  it("returns 0 for identical instants", () => {
    expect(workingTimeBetween(SUN_THU, THU_8AM, THU_8AM)).toBe(0);
  });

  it("returns a negative value when end precedes start (used for float sign)", () => {
    expect(workingTimeBetween(SUN_THU, THU_4PM, THU_8AM)).toBe(-480);
  });

  it("an Eid exception adds one more working day to the gap", () => {
    const withEid = workingTimeBetween(SUN_THU_WITH_EID, THU_8AM, new Date("2024-01-09T16:00:00Z"));
    const withoutEid = workingTimeBetween(SUN_THU, THU_8AM, new Date("2024-01-09T16:00:00Z"));
    expect(withEid).toBeLessThan(withoutEid);
  });
});
