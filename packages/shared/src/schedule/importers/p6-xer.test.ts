import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ScheduleImportRejectedError } from "../types";
import { parseP6Xer } from "./p6-xer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../../fixtures/schedules");

describe("parseP6Xer", () => {
  it("parses the sample.xer fixture into a ParsedSchedule", () => {
    const xerText = readFileSync(join(fixturesDir, "sample.xer"), "utf-8");
    const schedule = parseP6Xer(xerText);

    expect(schedule.sourceTool).toBe("p6_xer");
    expect(schedule.name).toBe("AMMAN-SUB");
    expect(schedule.dataDate).toBe("2026-01-01");

    // 1 WBS node + 4 activities.
    expect(schedule.tasks).toHaveLength(5);

    const wbs = schedule.tasks.find((t) => t.externalId === "wbs:W1")!;
    expect(wbs.taskType).toBe("wbs");
    expect(wbs.name).toBe("Substructure");

    const excavation = schedule.tasks.find((t) => t.externalId === "T2")!;
    expect(excavation.parentExternalId).toBe("wbs:W1");
    expect(excavation.wbsCode).toBe("A1010");
    expect(excavation.durationMinutes).toBe(48 * 60);
    expect(excavation.percentComplete).toBe(60);
    expect(excavation.isCritical).toBe(true); // total_float_hr_cnt = 0

    const milestone = schedule.tasks.find((t) => t.externalId === "T4")!;
    expect(milestone.taskType).toBe("milestone");
    expect(milestone.durationMinutes).toBe(0);

    expect(schedule.dependencies).toHaveLength(3);
    expect(schedule.dependencies).toContainEqual({
      predecessorExternalId: "T1",
      successorExternalId: "T2",
      type: "FS",
      lagMinutes: 0,
    });

    expect(schedule.calendars).toHaveLength(1);
    expect(schedule.calendars[0]!.isDefault).toBe(true);
    expect(schedule.calendars[0]!.workingDays).toBe(0b0011111);
  });

  it("rejects a file missing the ERMHDR header line", () => {
    expect(() => parseP6Xer("%T\tTASK\n%F\ttask_id\n%R\tT1")).toThrow(ScheduleImportRejectedError);
  });

  it("rejects a file with no TASK rows", () => {
    expect(() => parseP6Xer("ERMHDR\t21.12\n%T\tPROJECT\n%F\tproj_id\n%R\tP1\n%E")).toThrow(ScheduleImportRejectedError);
  });

  it("rejects a circular dependency between two activities", () => {
    const xer = [
      "ERMHDR\t21.12",
      "%T\tTASK",
      "%F\ttask_id\ttask_name\ttask_type",
      "%R\tT1\tA\tTT_Task",
      "%R\tT2\tB\tTT_Task",
      "%T\tTASKPRED",
      "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
      "%R\tL1\tT2\tT1\tPR_FS\t0",
      "%R\tL2\tT1\tT2\tPR_FS\t0",
      "%E",
    ].join("\n");
    expect(() => parseP6Xer(xer)).toThrow(ScheduleImportRejectedError);
  });
});
