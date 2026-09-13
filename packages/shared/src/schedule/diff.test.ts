import { describe, expect, it } from "vitest";
import { diffScheduleVersions, type PreviousVersionTask } from "./diff";
import type { ParsedSchedule, ParsedTask } from "./types";

function prevTask(overrides: Partial<PreviousVersionTask> & { externalId: string }): PreviousVersionTask {
  return { name: `Task ${overrides.externalId}`, percentComplete: 0, predecessorExternalIds: [], ...overrides };
}

function nextTask(overrides: Partial<ParsedTask> & { externalId: string }): ParsedTask {
  return { name: `Task ${overrides.externalId}`, taskType: "task", percentComplete: 0, sortOrder: 0, ...overrides };
}

function nextSchedule(tasks: ParsedTask[], dependencies: ParsedSchedule["dependencies"] = []): ParsedSchedule {
  return { sourceTool: "p6_xer", dataDate: "2026-02-01", calendars: [], tasks, dependencies, warnings: [] };
}

describe("diffScheduleVersions", () => {
  it("reports no changes for an identical re-import", () => {
    const previous = [prevTask({ externalId: "1", plannedStart: "2026-01-05" })];
    const next = nextSchedule([nextTask({ externalId: "1", plannedStart: "2026-01-05" })]);
    const diff = diffScheduleVersions(previous, next);
    expect(diff).toEqual({ added: [], removed: [], reDated: [], reLogicked: [], progressChanged: [] });
  });

  it("detects an added task", () => {
    const diff = diffScheduleVersions([], nextSchedule([nextTask({ externalId: "1" })]));
    expect(diff.added).toEqual([{ externalId: "1", name: "Task 1", changeType: "added" }]);
  });

  it("detects a removed task", () => {
    const diff = diffScheduleVersions([prevTask({ externalId: "1" })], nextSchedule([]));
    expect(diff.removed).toEqual([{ externalId: "1", name: "Task 1", changeType: "removed" }]);
  });

  it("detects a re-dated task with the correct day shift", () => {
    const previous = [prevTask({ externalId: "1", plannedStart: "2026-01-05" })];
    const next = nextSchedule([nextTask({ externalId: "1", plannedStart: "2026-01-10" })]);
    const diff = diffScheduleVersions(previous, next);
    expect(diff.reDated).toEqual([{ externalId: "1", name: "Task 1", changeType: "re_dated", startShiftDays: 5 }]);
  });

  it("detects a progress change", () => {
    const previous = [prevTask({ externalId: "1", percentComplete: 20 })];
    const next = nextSchedule([nextTask({ externalId: "1", percentComplete: 60 })]);
    const diff = diffScheduleVersions(previous, next);
    expect(diff.progressChanged).toEqual([
      { externalId: "1", name: "Task 1", changeType: "progress_changed", previousPercentComplete: 20, newPercentComplete: 60 },
    ]);
  });

  it("detects re-logicked when predecessors change", () => {
    const previous = [prevTask({ externalId: "2", predecessorExternalIds: ["1"] })];
    const next = nextSchedule(
      [nextTask({ externalId: "1" }), nextTask({ externalId: "2" }), nextTask({ externalId: "3" })],
      [{ predecessorExternalId: "3", successorExternalId: "2", type: "FS", lagMinutes: 0 }],
    );
    const diff = diffScheduleVersions(previous, next);
    expect(diff.reLogicked.map((e) => e.externalId)).toContain("2");
  });

  it("matches by wbsCode when externalId changed (e.g. a fresh export re-numbered ids)", () => {
    const previous = [prevTask({ externalId: "old-1", wbsCode: "1.1", percentComplete: 0 })];
    const next = nextSchedule([nextTask({ externalId: "new-1", wbsCode: "1.1", percentComplete: 50 })]);
    const diff = diffScheduleVersions(previous, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.progressChanged).toHaveLength(1);
  });

  it("falls back to an exact name match when neither externalId nor wbsCode match", () => {
    const previous = [prevTask({ externalId: "old-1", name: "Mobilization", percentComplete: 0 })];
    const next = nextSchedule([nextTask({ externalId: "new-1", name: "Mobilization", percentComplete: 100 })]);
    const diff = diffScheduleVersions(previous, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.progressChanged).toHaveLength(1);
  });
});
