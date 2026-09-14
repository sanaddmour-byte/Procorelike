import { describe, expect, it } from "vitest";
import { workingTimeBetween } from "./calendar";
import { computeSchedule, type CpmCalendar, type CpmDependency, type CpmTask } from "./cpm";

/**
 * The golden-file suite docs/SCHEDULING.md A4 requires: at least 25
 * hand-computed scenarios covering negative lag, SS with lag, a
 * non-working-week calendar, an Eid exception, out-of-sequence progress,
 * and a 2,000-task performance case under 500ms.
 *
 * Shared reference week: 2024-01-01 is a Monday, so 01-04=Thu, 01-05=Fri,
 * 01-06=Sat, 01-07=Sun, 01-08=Mon, 01-09=Tue, 01-10=Wed, 01-11=Thu,
 * 01-14=Sun. All scenarios anchor to Thursday 2024-01-04 08:00 unless
 * noted, matching calendar.test.ts's reference dates.
 */

const SUN_THU: CpmCalendar = { id: "cal-sun-thu", hoursPerDay: 8, workingDays: 0b0011111, exceptions: [], isDefault: true };
const SUN_THU_WITH_EID: CpmCalendar = { ...SUN_THU, id: "cal-eid", exceptions: [{ date: "2024-01-07", isWorking: false }] };
/** Mon/Wed/Fri only -- proves the engine isn't hardcoded to any particular week shape. */
const MON_WED_FRI: CpmCalendar = { id: "cal-mwf", hoursPerDay: 8, workingDays: 0b0101010, exceptions: [], isDefault: true };

const DATA_DATE = "2024-01-04T08:00:00Z";

function task(id: string, overrides: Partial<CpmTask> = {}): CpmTask {
  return { id, taskType: "task", durationMinutes: 480, calendarId: SUN_THU.id, percentComplete: 0, ...overrides };
}

function dep(predecessorId: string, successorId: string, type: CpmDependency["type"] = "FS", lagMinutes = 0): CpmDependency {
  return { predecessorId, successorId, type, lagMinutes };
}

function run(tasks: CpmTask[], dependencies: CpmDependency[], calendars: CpmCalendar[] = [SUN_THU], overrides: Partial<{ dataDate: string; retainedLogic: boolean; ignoreConstraintsOnCritical: boolean; criticalFloatThresholdMinutes: number }> = {}) {
  return computeSchedule({
    tasks,
    dependencies,
    calendars,
    dataDate: overrides.dataDate ?? DATA_DATE,
    options: {
      retainedLogic: overrides.retainedLogic ?? true,
      ignoreConstraintsOnCritical: overrides.ignoreConstraintsOnCritical,
      criticalFloatThresholdMinutes: overrides.criticalFloatThresholdMinutes,
    },
  });
}

function byId(result: ReturnType<typeof run>, id: string) {
  const t = result.tasks.find((r) => r.id === id);
  if (!t) throw new Error(`No result for task "${id}"`);
  return t;
}

describe("computeSchedule -- basic forward/backward pass", () => {
  it("1. a single task with no predecessors/successors is critical with zero float, anchored to the data date", () => {
    const result = run([task("A")], []);
    const a = byId(result, "A");
    expect(a.earlyStart).toBe("2024-01-04T08:00:00.000Z");
    expect(a.earlyFinish).toBe("2024-01-04T16:00:00.000Z");
    expect(a.lateStart).toBe(a.earlyStart);
    expect(a.lateFinish).toBe(a.earlyFinish);
    expect(a.totalFloatMinutes).toBe(0);
    expect(a.freeFloatMinutes).toBe(0);
    expect(a.isCritical).toBe(true);
  });

  it("2. FS with zero lag skips the weekend, landing the successor on the next working day", () => {
    const result = run([task("A"), task("B")], [dep("A", "B", "FS", 0)]);
    expect(byId(result, "A").earlyFinish).toBe("2024-01-04T16:00:00.000Z");
    expect(byId(result, "B").earlyStart).toBe("2024-01-07T08:00:00.000Z"); // Sunday, skipping Fri/Sat
    expect(byId(result, "B").earlyFinish).toBe("2024-01-07T16:00:00.000Z");
  });

  it("3. FS with positive lag shifts the successor's start by exactly the lag, in working time", () => {
    const result = run([task("A"), task("B")], [dep("A", "B", "FS", 240)]);
    expect(byId(result, "B").earlyStart).toBe("2024-01-07T12:00:00.000Z");
    expect(byId(result, "B").earlyFinish).toBe("2024-01-08T12:00:00.000Z");
  });

  it("4. FS with negative lag (overlap) lets the successor start before the predecessor finishes", () => {
    const result = run([task("A"), task("B")], [dep("A", "B", "FS", -240)]);
    // A finishes Thu 16:00; -240 lag pulls B's earliest start back 4h within Thursday's own window.
    expect(byId(result, "B").earlyStart).toBe("2024-01-04T12:00:00.000Z");
  });

  it("5. SS with positive lag ties the successor's start to the predecessor's start, not its finish", () => {
    const result = run([task("A", { durationMinutes: 1440 }), task("B")], [dep("A", "B", "SS", 240)]);
    // A starts Thu 08:00; SS+240 -> successor starts Thu 12:00, independent of A's (much longer) duration.
    expect(byId(result, "B").earlyStart).toBe("2024-01-04T12:00:00.000Z");
  });

  it("6. SS with negative lag can start the successor before the predecessor, rolling back across the weekend when there's no room same-day", () => {
    // A starts exactly at Thursday's window open (08:00), so there's no room to go "4h earlier" within
    // Thursday itself -- it correctly rolls back across Fri/Sat to consume the remainder from Wednesday.
    const result = run([task("A"), task("B")], [dep("A", "B", "SS", -240)]);
    expect(byId(result, "B").earlyStart).toBe("2024-01-03T12:00:00.000Z");
  });

  it("7. FF ties the successor's finish to the predecessor's finish", () => {
    const result = run([task("A"), task("B", { durationMinutes: 240 })], [dep("A", "B", "FF", 0)]);
    expect(byId(result, "B").earlyFinish).toBe(byId(result, "A").earlyFinish);
    expect(byId(result, "B").earlyStart).toBe("2024-01-04T12:00:00.000Z"); // finish (16:00) minus its own 4h duration
  });

  it("8. SF ties the successor's finish to the predecessor's start (zero working-time gap between them)", () => {
    const result = run([task("A"), task("B", { durationMinutes: 240 })], [dep("A", "B", "SF", 0)]);
    // Not raw Date equality: a finish landing exactly at Wednesday's window-end and a start landing at
    // Thursday's window-open are different Date values but the *same* working-time instant (Wed/Thu are
    // consecutive working days with nothing between them) -- workingTimeBetween is the correct invariant.
    const gap = workingTimeBetween(SUN_THU, new Date(byId(result, "B").earlyFinish), new Date(byId(result, "A").earlyStart));
    expect(gap).toBe(0);
  });

  it("9. milestones have zero duration regardless of the duration field", () => {
    const result = run([task("A"), task("M", { taskType: "milestone", durationMinutes: 999 })], [dep("A", "M", "FS", 0)]);
    const m = byId(result, "M");
    expect(m.earlyStart).toBe(m.earlyFinish);
  });

  it("10. a milestone can itself be a predecessor to a normal task", () => {
    const result = run([task("M", { taskType: "milestone", durationMinutes: 0 }), task("B")], [dep("M", "B", "FS", 0)]);
    expect(byId(result, "B").earlyStart).toBe(byId(result, "M").earlyFinish);
  });
});

describe("computeSchedule -- float and critical path", () => {
  it("11. a diamond dependency gives the shorter parallel branch positive float", () => {
    // A -> B (2 days) -> D ; A -> C (1 day) -> D. D is driven by B; C has one day of slack.
    const tasks = [task("A"), task("B", { durationMinutes: 960 }), task("C", { durationMinutes: 480 }), task("D")];
    const deps = [dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "D")];
    const result = run(tasks, deps);
    expect(byId(result, "A").isCritical).toBe(true);
    expect(byId(result, "B").isCritical).toBe(true);
    expect(byId(result, "D").isCritical).toBe(true);
    expect(byId(result, "C").isCritical).toBe(false);
    expect(byId(result, "C").totalFloatMinutes).toBeGreaterThan(0);
  });

  it("12. free float reflects the tighter of two successors, not the looser one", () => {
    // A has two successors: B (immediate, no slack) and C (which has its own long lead time, so plenty of slack against A specifically).
    const tasks = [task("A"), task("B"), task("C", { durationMinutes: 480 })];
    const deps = [dep("A", "B", "FS", 0), dep("A", "C", "FS", 2880)]; // 2880min = 6 working days of lag
    const result = run(tasks, deps);
    // A's free float is bounded by B (its tightest successor), which starts immediately after A with no slack.
    expect(byId(result, "A").freeFloatMinutes).toBe(0);
  });

  it("13. a task with no successors has free float equal to its total float", () => {
    const chained = [task("P"), task("A"), task("B", { durationMinutes: 1440 })];
    const deps = [dep("P", "A", "FS", 0), dep("P", "B", "FS", 0)];
    const result = run(chained, deps);
    const a = byId(result, "A");
    expect(a.freeFloatMinutes).toBe(a.totalFloatMinutes);
  });
});

describe("computeSchedule -- cycle detection and orphaned links", () => {
  it("14. a circular dependency is reported as a cycle, not thrown", () => {
    const tasks = [task("A"), task("B"), task("C")];
    const deps = [dep("A", "B"), dep("B", "C"), dep("C", "A")];
    const result = run(tasks, deps);
    expect(result.cycle).not.toBeNull();
    expect(result.cycle!.taskIds.sort()).toEqual(["A", "B", "C"]);
    expect(result.tasks).toEqual([]);
  });

  it("15. a dependency to a nonexistent task is a warning, not a crash, and the rest of the schedule still computes", () => {
    const result = run([task("A")], [dep("A", "ghost", "FS", 0)]);
    expect(result.warnings.some((w) => w.code === "orphaned_successor")).toBe(true);
    expect(byId(result, "A").earlyStart).toBe("2024-01-04T08:00:00.000Z");
  });
});

describe("computeSchedule -- constraints", () => {
  it("16. SNET pushes the start later than logic alone would compute", () => {
    const result = run([task("A", { constraintType: "snet", constraintDate: "2024-01-10T08:00:00Z" })], []);
    expect(byId(result, "A").earlyStart).toBe("2024-01-10T08:00:00.000Z");
  });

  it("17. SNLT does not move the date but raises a warning when violated", () => {
    // Logic alone starts A on the data date (Thu); an SNLT of the previous Sunday is already violated.
    const result = run([task("A", { constraintType: "snlt", constraintDate: "2023-12-31T08:00:00Z" })], []);
    expect(byId(result, "A").earlyStart).toBe("2024-01-04T08:00:00.000Z");
    expect(result.warnings.some((w) => w.code === "constraint_violation" && w.taskId === "A")).toBe(true);
  });

  it("18. FNET pushes the finish (and therefore the start) later than logic alone would compute", () => {
    const result = run([task("A", { constraintType: "fnet", constraintDate: "2024-01-10T16:00:00Z" })], []);
    expect(byId(result, "A").earlyFinish).toBe("2024-01-10T16:00:00.000Z");
  });

  it("19. FNLT raises a warning when the computed finish is later than allowed, without moving it", () => {
    const result = run([task("A", { constraintType: "fnlt", constraintDate: "2023-12-31T16:00:00Z" })], []);
    expect(byId(result, "A").earlyFinish).toBe("2024-01-04T16:00:00.000Z");
    expect(result.warnings.some((w) => w.code === "constraint_violation" && w.taskId === "A")).toBe(true);
  });

  it("20. MSO forces the exact start with no warning when it's consistent with predecessor logic", () => {
    const result = run([task("A", { constraintType: "mso", constraintDate: "2024-01-10T08:00:00Z" })], []);
    expect(byId(result, "A").earlyStart).toBe("2024-01-10T08:00:00.000Z");
    expect(result.warnings.filter((w) => w.taskId === "A")).toHaveLength(0);
  });

  it("21. MSO still forces the date but warns when predecessor logic actually requires a later start", () => {
    const tasks = [task("A"), task("B", { constraintType: "mso", constraintDate: "2024-01-04T08:00:00Z" })];
    const result = run(tasks, [dep("A", "B", "FS", 0)]);
    expect(byId(result, "B").earlyStart).toBe("2024-01-04T08:00:00.000Z");
    expect(result.warnings.some((w) => w.code === "constraint_violation" && w.taskId === "B")).toBe(true);
  });

  it("22. MFO forces the exact finish", () => {
    const result = run([task("A", { constraintType: "mfo", constraintDate: "2024-01-10T16:00:00Z" })], []);
    expect(byId(result, "A").earlyFinish).toBe("2024-01-10T16:00:00.000Z");
  });

  it("23. ALAP collapses a task's own float to zero without corrupting its successor's dates", () => {
    // A(ALAP) -> B, with a third parallel path so A would otherwise have slack.
    const tasks = [task("P"), task("A", { constraintType: "alap" }), task("Long", { durationMinutes: 1920 }), task("B")];
    const deps = [dep("P", "A"), dep("P", "Long"), dep("A", "B"), dep("Long", "B")];
    const result = run(tasks, deps);
    const a = byId(result, "A");
    expect(a.earlyStart).toBe(a.lateStart);
    expect(a.totalFloatMinutes).toBe(0);
    // B's own start is still driven correctly by the longer parallel path (zero working-time gap from
    // Long's finish), not disturbed by A's own ALAP adjustment.
    const gap = workingTimeBetween(SUN_THU, new Date(byId(result, "Long").earlyFinish), new Date(byId(result, "B").earlyStart));
    expect(gap).toBe(0);
  });
});

describe("computeSchedule -- calendars", () => {
  it("24. a non-Sun-Thu, non-Mon-Fri calendar (Mon/Wed/Fri) is honored, proving no week shape is hardcoded", () => {
    // 2024-01-08 is a Monday (working). A 2-day (960min) duration should skip Tuesday, landing on Wednesday.
    const result = run([task("A", { calendarId: MON_WED_FRI.id, durationMinutes: 960 })], [], [MON_WED_FRI], { dataDate: "2024-01-08T08:00:00Z" });
    expect(byId(result, "A").earlyFinish).toBe("2024-01-10T16:00:00.000Z");
  });

  it("25. an Eid calendar exception pushes dates by one further working day than the same schedule without it", () => {
    const withEid = run([task("A"), task("B", { durationMinutes: 1440 })], [dep("A", "B")], [SUN_THU_WITH_EID]);
    const withoutEid = run([task("A"), task("B", { durationMinutes: 1440 })], [dep("A", "B")], [SUN_THU]);
    expect(new Date(byId(withEid, "B").earlyFinish).getTime()).toBeGreaterThan(new Date(byId(withoutEid, "B").earlyFinish).getTime());
  });

  it("26. two tasks on different calendars each honor their own working pattern", () => {
    const tasks = [task("A", { calendarId: SUN_THU.id }), task("B", { calendarId: MON_WED_FRI.id })];
    const result = run(tasks, [], [SUN_THU, MON_WED_FRI]);
    // Both anchor to the same data date but finish differently because their calendars differ.
    expect(byId(result, "A").earlyFinish).not.toBe(byId(result, "B").earlyFinish);
  });
});

describe("computeSchedule -- progress and the data date", () => {
  it("27. retained logic keeps an in-progress task's remaining work anchored to the data date, not before it", () => {
    const tasks = [
      task("A", {
        durationMinutes: 1440,
        percentComplete: 50,
        actualStart: "2024-01-04T08:00:00Z", // started on the data date itself
      }),
    ];
    const result = run(tasks, [], [SUN_THU], { dataDate: "2024-01-04T08:00:00Z", retainedLogic: true });
    // 50% of 1440min = 720min remaining, resumed from the data date (Thu 08:00).
    expect(byId(result, "A").earlyFinish).toBe("2024-01-07T12:00:00.000Z");
  });

  it("28. out-of-sequence progress: retained logic still waits on the predecessor's logical date, progress override resumes at the actual start", () => {
    // A finishes Thursday; logic alone would have B start Sunday (skipping the weekend). But the crew
    // actually jumped ahead and started B on Thursday itself, out of sequence with that logic.
    const tasks = [task("A"), task("B", { durationMinutes: 960, percentComplete: 50, actualStart: "2024-01-04T08:00:00Z" })];
    const deps = [dep("A", "B", "FS", 0)];
    const dataDate = "2024-01-04T08:00:00Z";
    const retained = run(tasks, deps, [SUN_THU], { dataDate, retainedLogic: true });
    const override = run(tasks, deps, [SUN_THU], { dataDate, retainedLogic: false });
    // Retained logic: the remaining 50% (480min) resumes no earlier than the predecessor-driven Sunday start.
    expect(byId(retained, "B").earlyFinish).toBe("2024-01-07T16:00:00.000Z");
    // Progress override: the remaining work just continues from wherever the crew actually says it is.
    expect(byId(override, "B").earlyFinish).toBe("2024-01-04T16:00:00.000Z");
    expect(new Date(byId(retained, "B").earlyFinish).getTime()).toBeGreaterThan(new Date(byId(override, "B").earlyFinish).getTime());
  });

  it("29. a fully complete task (actualFinish set) is fixed in time and feeds its successor from the actual finish, not a recomputed one", () => {
    const tasks = [task("A", { actualStart: "2024-01-04T08:00:00Z", actualFinish: "2024-01-04T10:00:00Z", percentComplete: 100 }), task("B")];
    const result = run(tasks, [dep("A", "B")]);
    expect(byId(result, "A").earlyFinish).toBe("2024-01-04T10:00:00.000Z");
    expect(byId(result, "B").earlyStart).toBe("2024-01-04T10:00:00.000Z");
  });
});

describe("computeSchedule -- WBS/summary rollup", () => {
  it("30. a summary task's dates and percent-complete roll up from its children, duration-weighted", () => {
    const tasks = [
      task("S", { taskType: "summary", durationMinutes: 0 }),
      task("A", { parentId: "S", durationMinutes: 480, percentComplete: 100 }),
      task("B", { parentId: "S", durationMinutes: 1440, percentComplete: 0 }),
    ];
    const result = run(tasks, [dep("A", "B")]);
    const s = byId(result, "S");
    expect(s.earlyStart).toBe(byId(result, "A").earlyStart);
    expect(s.earlyFinish).toBe(byId(result, "B").earlyFinish);
    // Weighted: (480*100 + 1440*0) / (480+1440) = 25%.
    expect(s.percentComplete).toBe(25);
  });

  it("31. a summary task is itself never directly scheduled off its own duration/calendar fields", () => {
    const tasks = [task("S", { taskType: "summary", durationMinutes: 99999 }), task("A", { parentId: "S" })];
    const result = run(tasks, []);
    // The summary's finish must equal its only child's finish, not something derived from the (ignored) 99999min duration.
    expect(byId(result, "S").earlyFinish).toBe(byId(result, "A").earlyFinish);
  });
});

describe("computeSchedule -- ignoreConstraintsOnCritical", () => {
  it("32. suppresses a soft constraint's effect specifically on tasks that end up critical", () => {
    const tasks = [task("A", { constraintType: "snet", constraintDate: "2024-01-10T08:00:00Z" })];
    const normal = run(tasks, [], [SUN_THU], { ignoreConstraintsOnCritical: false });
    const suppressed = run(tasks, [], [SUN_THU], { ignoreConstraintsOnCritical: true });
    expect(byId(normal, "A").earlyStart).toBe("2024-01-10T08:00:00.000Z");
    expect(byId(suppressed, "A").earlyStart).toBe("2024-01-04T08:00:00.000Z");
  });

  it("33. never suppresses a hard MSO/MFO constraint even when the task is critical", () => {
    const tasks = [task("A", { constraintType: "mso", constraintDate: "2024-01-10T08:00:00Z" })];
    const result = run(tasks, [], [SUN_THU], { ignoreConstraintsOnCritical: true });
    expect(byId(result, "A").earlyStart).toBe("2024-01-10T08:00:00.000Z");
  });
});

describe("computeSchedule -- critical float threshold", () => {
  it("34. a configurable threshold widens what counts as critical", () => {
    const tasks = [task("A"), task("B", { durationMinutes: 960 }), task("C", { durationMinutes: 480 }), task("D")];
    const deps = [dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "D")];
    const defaultThreshold = run(tasks, deps);
    const widened = run(tasks, deps, [SUN_THU], { criticalFloatThresholdMinutes: 480 });
    expect(byId(defaultThreshold, "C").isCritical).toBe(false);
    expect(byId(widened, "C").isCritical).toBe(true);
  });
});

describe("computeSchedule -- performance", () => {
  it("35. a 2,000-task finish-to-start chain computes in under 500ms", () => {
    const count = 2000;
    const tasks: CpmTask[] = Array.from({ length: count }, (_, i) => task(`T${i}`, { durationMinutes: 480 }));
    const deps: CpmDependency[] = Array.from({ length: count - 1 }, (_, i) => dep(`T${i}`, `T${i + 1}`, "FS", 0));
    const start = performance.now();
    const result = computeSchedule({
      tasks,
      dependencies: deps,
      calendars: [SUN_THU],
      dataDate: DATA_DATE,
      options: { retainedLogic: true },
    });
    const elapsed = performance.now() - start;
    expect(result.cycle).toBeNull();
    expect(result.tasks).toHaveLength(count);
    expect(elapsed).toBeLessThan(500);
  });
});
