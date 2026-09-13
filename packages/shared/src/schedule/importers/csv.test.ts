import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ScheduleImportRejectedError } from "../types";
import { parseCsvSchedule, parseScheduleRows } from "./csv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../../fixtures/schedules");

describe("parseCsvSchedule", () => {
  it("parses the sample.csv fixture into a ParsedSchedule", () => {
    const csvText = readFileSync(join(fixturesDir, "sample.csv"), "utf-8");
    const schedule = parseCsvSchedule(csvText, { dataDate: "2026-01-01" });

    expect(schedule.sourceTool).toBe("csv");
    expect(schedule.tasks).toHaveLength(5);
    expect(schedule.warnings).toEqual([]);

    const foundation = schedule.tasks.find((t) => t.externalId === "3");
    expect(foundation).toBeDefined();
    expect(foundation!.name).toBe("Foundation pour");
    expect(foundation!.wbsCode).toBe("1.3");
    expect(foundation!.durationMinutes).toBe(6 * 24 * 60);
    expect(foundation!.percentComplete).toBe(0);

    // Quoted field with an embedded comma parsed correctly.
    const backfill = schedule.tasks.find((t) => t.externalId === "4");
    expect(backfill!.name).toBe("Backfill, compaction");

    // Every row's predecessor became a Finish-to-Start dependency.
    expect(schedule.dependencies).toHaveLength(4);
    expect(schedule.dependencies).toContainEqual({
      predecessorExternalId: "1",
      successorExternalId: "2",
      type: "FS",
      lagMinutes: 0,
    });
  });

  it("skips a row missing a required id/name and records a warning", () => {
    const schedule = parseScheduleRows(
      [
        ["ID", "Task Name"],
        ["1", "Valid task"],
        ["", "Missing id"],
        ["3", ""],
      ],
      { dataDate: "2026-01-01" },
    );
    expect(schedule.tasks).toHaveLength(1);
    expect(schedule.warnings).toHaveLength(2);
  });

  it("rejects a circular dependency", () => {
    expect(() =>
      parseScheduleRows(
        [
          ["ID", "Task Name", "Predecessors"],
          ["1", "A", "2"],
          ["2", "B", "1"],
        ],
        { dataDate: "2026-01-01" },
      ),
    ).toThrow(ScheduleImportRejectedError);
  });

  it("throws a clear error when required columns can't be resolved", () => {
    expect(() => parseScheduleRows([["Foo", "Bar"], ["x", "y"]], { dataDate: "2026-01-01" })).toThrow(/could not find required columns/);
  });

  it("respects an explicit column mapping over header-name guessing", () => {
    const schedule = parseScheduleRows(
      [
        ["Custom Id Col", "Custom Name Col"],
        ["T1", "Custom-mapped task"],
      ],
      { dataDate: "2026-01-01", columnMapping: { id: "Custom Id Col", name: "Custom Name Col" } },
    );
    expect(schedule.tasks).toHaveLength(1);
    expect(schedule.tasks[0]!.name).toBe("Custom-mapped task");
  });
});
