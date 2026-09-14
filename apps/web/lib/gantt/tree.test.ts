import { describe, expect, it } from "vitest";
import { flattenWbsTree } from "./tree";
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

describe("flattenWbsTree", () => {
  it("orders a flat list with no hierarchy by sortOrder", () => {
    const rows = flattenWbsTree([task({ id: "2", sortOrder: 2 }), task({ id: "1", sortOrder: 1 })], new Set());
    expect(rows.map((r) => r.id)).toEqual(["1", "2"]);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
  });

  it("nests children under a parent depth-first, in sortOrder", () => {
    const rows = flattenWbsTree(
      [
        task({ id: "root", sortOrder: 0, taskType: "wbs" }),
        task({ id: "child2", parentTaskId: "root", sortOrder: 2 }),
        task({ id: "child1", parentTaskId: "root", sortOrder: 1 }),
      ],
      new Set(),
    );
    expect(rows.map((r) => r.id)).toEqual(["root", "child1", "child2"]);
    expect(rows.find((r) => r.id === "root")!.depth).toBe(0);
    expect(rows.find((r) => r.id === "child1")!.depth).toBe(1);
    expect(rows.find((r) => r.id === "root")!.hasChildren).toBe(true);
    expect(rows.find((r) => r.id === "child1")!.hasChildren).toBe(false);
  });

  it("skips descendants of a collapsed node but keeps the node itself", () => {
    const tasks = [
      task({ id: "root", sortOrder: 0, taskType: "wbs" }),
      task({ id: "child", parentTaskId: "root", sortOrder: 0 }),
      task({ id: "grandchild", parentTaskId: "child", sortOrder: 0 }),
    ];
    const rows = flattenWbsTree(tasks, new Set(["child"]));
    expect(rows.map((r) => r.id)).toEqual(["root", "child"]);
    expect(rows.find((r) => r.id === "child")!.isCollapsed).toBe(true);
  });

  it("handles multiple levels of nesting", () => {
    const tasks = [
      task({ id: "a", sortOrder: 0, taskType: "wbs" }),
      task({ id: "a.1", parentTaskId: "a", sortOrder: 0, taskType: "wbs" }),
      task({ id: "a.1.1", parentTaskId: "a.1", sortOrder: 0 }),
    ];
    const rows = flattenWbsTree(tasks, new Set());
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ["a", 0],
      ["a.1", 1],
      ["a.1.1", 2],
    ]);
  });
});
