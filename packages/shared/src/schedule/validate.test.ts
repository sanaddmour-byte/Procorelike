import { describe, expect, it } from "vitest";
import type { ParsedSchedule, ParsedTask } from "./types";
import { validateParsedSchedule } from "./validate";

function task(externalId: string, overrides: Partial<ParsedTask> = {}): ParsedTask {
  return { externalId, name: `Task ${externalId}`, taskType: "task", percentComplete: 0, sortOrder: 0, ...overrides };
}

function schedule(overrides: Partial<ParsedSchedule> = {}): ParsedSchedule {
  return { sourceTool: "csv", dataDate: "2026-01-01", calendars: [], tasks: [], dependencies: [], warnings: [], ...overrides };
}

describe("validateParsedSchedule", () => {
  it("passes a clean schedule with no errors", () => {
    const s = schedule({
      tasks: [task("1"), task("2")],
      dependencies: [{ predecessorExternalId: "1", successorExternalId: "2", type: "FS", lagMinutes: 0 }],
    });
    expect(validateParsedSchedule(s)).toEqual([]);
  });

  it("rejects a negative duration", () => {
    const s = schedule({ tasks: [task("1", { durationMinutes: -60 })] });
    const errors = validateParsedSchedule(s);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("negative_duration");
  });

  it("rejects a dependency pointing at a task that doesn't exist", () => {
    const s = schedule({
      tasks: [task("1")],
      dependencies: [{ predecessorExternalId: "1", successorExternalId: "ghost", type: "FS", lagMinutes: 0 }],
    });
    const errors = validateParsedSchedule(s);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("orphaned_predecessor");
  });

  it("detects a direct two-task circular dependency and reports the chain", () => {
    const s = schedule({
      tasks: [task("1"), task("2")],
      dependencies: [
        { predecessorExternalId: "1", successorExternalId: "2", type: "FS", lagMinutes: 0 },
        { predecessorExternalId: "2", successorExternalId: "1", type: "FS", lagMinutes: 0 },
      ],
    });
    const errors = validateParsedSchedule(s);
    const cycleError = errors.find((e) => e.code === "circular_dependency");
    expect(cycleError).toBeDefined();
    expect(cycleError!.taskExternalIds).toEqual(["1", "2", "1"]);
  });

  it("detects a longer three-task cycle", () => {
    const s = schedule({
      tasks: [task("A"), task("B"), task("C")],
      dependencies: [
        { predecessorExternalId: "A", successorExternalId: "B", type: "FS", lagMinutes: 0 },
        { predecessorExternalId: "B", successorExternalId: "C", type: "FS", lagMinutes: 0 },
        { predecessorExternalId: "C", successorExternalId: "A", type: "FS", lagMinutes: 0 },
      ],
    });
    const errors = validateParsedSchedule(s);
    const cycleError = errors.find((e) => e.code === "circular_dependency");
    expect(cycleError).toBeDefined();
    expect(cycleError!.taskExternalIds).toEqual(["A", "B", "C", "A"]);
  });

  it("does not false-positive a cycle on a diamond dependency shape", () => {
    const s = schedule({
      tasks: [task("start"), task("left"), task("right"), task("end")],
      dependencies: [
        { predecessorExternalId: "start", successorExternalId: "left", type: "FS", lagMinutes: 0 },
        { predecessorExternalId: "start", successorExternalId: "right", type: "FS", lagMinutes: 0 },
        { predecessorExternalId: "left", successorExternalId: "end", type: "FS", lagMinutes: 0 },
        { predecessorExternalId: "right", successorExternalId: "end", type: "FS", lagMinutes: 0 },
      ],
    });
    expect(validateParsedSchedule(s)).toEqual([]);
  });

  it("does not blow the call stack on a long unbroken FS chain (P6/MSP schedules routinely chain thousands of activities)", () => {
    const count = 20_000;
    const tasks: ParsedTask[] = [];
    const dependencies: ParsedSchedule["dependencies"] = [];
    for (let i = 1; i <= count; i++) {
      tasks.push(task(String(i)));
      if (i > 1) dependencies.push({ predecessorExternalId: String(i - 1), successorExternalId: String(i), type: "FS", lagMinutes: 0 });
    }
    const s = schedule({ tasks, dependencies });
    expect(validateParsedSchedule(s)).toEqual([]);
  });

  it("still finds the cycle at the far end of a long chain", () => {
    const count = 20_000;
    const tasks: ParsedTask[] = [];
    const dependencies: ParsedSchedule["dependencies"] = [];
    for (let i = 1; i <= count; i++) {
      tasks.push(task(String(i)));
      if (i > 1) dependencies.push({ predecessorExternalId: String(i - 1), successorExternalId: String(i), type: "FS", lagMinutes: 0 });
    }
    dependencies.push({ predecessorExternalId: String(count), successorExternalId: "1", type: "FS", lagMinutes: 0 });
    const s = schedule({ tasks, dependencies });
    const errors = validateParsedSchedule(s);
    const cycleError = errors.find((e) => e.code === "circular_dependency");
    expect(cycleError).toBeDefined();
    expect(cycleError!.taskExternalIds).toHaveLength(count + 1);
  });
});
