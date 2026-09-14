import { describe, expect, it } from "vitest";
import { applyGanttFilters } from "./filter";
import type { GanttTask } from "./types";

function task(overrides: Partial<GanttTask> & { id: string }): GanttTask {
  return {
    externalId: null,
    wbsCode: null,
    parentTaskId: null,
    name: `Task ${overrides.id}`,
    taskType: "task",
    plannedStart: null,
    plannedFinish: null,
    earlyStart: null,
    earlyFinish: null,
    actualStart: null,
    actualFinish: null,
    totalFloatMinutes: null,
    isCritical: false,
    percentComplete: 0,
    responsibleCompanyId: null,
    sortOrder: 0,
    durationMinutes: null,
    constraintType: null,
    constraintDate: null,
    ...overrides,
  };
}

describe("applyGanttFilters", () => {
  const tasks = [
    task({ id: "root", taskType: "wbs", sortOrder: 0 }),
    task({ id: "a", parentTaskId: "root", name: "Excavation", isCritical: true, responsibleCompanyId: "gc", sortOrder: 1 }),
    task({ id: "b", parentTaskId: "root", name: "Painting", isCritical: false, responsibleCompanyId: "sub1", sortOrder: 2 }),
  ];

  it("returns every task when no filter is active", () => {
    expect(applyGanttFilters(tasks, { search: "", criticalOnly: false, companyId: null })).toHaveLength(3);
  });

  it("filters by name, case-insensitively", () => {
    const result = applyGanttFilters(tasks, { search: "excav", criticalOnly: false, companyId: null });
    expect(result.map((t) => t.id).sort()).toEqual(["a", "root"]);
  });

  it("filters by critical-only", () => {
    const result = applyGanttFilters(tasks, { search: "", criticalOnly: true, companyId: null });
    expect(result.map((t) => t.id).sort()).toEqual(["a", "root"]);
  });

  it("filters by responsible company", () => {
    const result = applyGanttFilters(tasks, { search: "", criticalOnly: false, companyId: "sub1" });
    expect(result.map((t) => t.id).sort()).toEqual(["b", "root"]);
  });

  it("keeps the full ancestor chain for a deeply nested match", () => {
    const nested = [
      task({ id: "root", taskType: "wbs", sortOrder: 0 }),
      task({ id: "mid", parentTaskId: "root", taskType: "wbs", sortOrder: 0 }),
      task({ id: "leaf", parentTaskId: "mid", name: "Rebar", sortOrder: 0 }),
      task({ id: "other", parentTaskId: "root", name: "Unrelated", sortOrder: 1 }),
    ];
    const result = applyGanttFilters(nested, { search: "rebar", criticalOnly: false, companyId: null });
    expect(result.map((t) => t.id).sort()).toEqual(["leaf", "mid", "root"]);
  });

  it("returns an empty result when nothing matches", () => {
    expect(applyGanttFilters(tasks, { search: "nonexistent", criticalOnly: false, companyId: null })).toHaveLength(0);
  });
});
