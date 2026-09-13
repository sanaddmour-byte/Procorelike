import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ScheduleImportRejectedError } from "../types";
import { parseP6Xml } from "./p6-xml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../../fixtures/schedules");

describe("parseP6Xml", () => {
  it("parses the sample-p6.xml fixture into a ParsedSchedule", () => {
    const xmlText = readFileSync(join(fixturesDir, "sample-p6.xml"), "utf-8");
    const schedule = parseP6Xml(xmlText);

    expect(schedule.sourceTool).toBe("p6_xml");
    expect(schedule.name).toBe("Amman Heights - Substructure");
    expect(schedule.dataDate).toBe("2026-01-01");

    // 1 WBS node + 3 activities.
    expect(schedule.tasks).toHaveLength(4);

    const wbs = schedule.tasks.find((t) => t.externalId === "wbs:100")!;
    expect(wbs.taskType).toBe("wbs");

    const excavation = schedule.tasks.find((t) => t.wbsCode === "A1010")!;
    expect(excavation.parentExternalId).toBe("wbs:100");
    expect(excavation.durationMinutes).toBe(48 * 60);
    expect(excavation.percentComplete).toBe(60);
    expect(excavation.isCritical).toBe(true);

    const milestone = schedule.tasks.find((t) => t.wbsCode === "A1030")!;
    expect(milestone.taskType).toBe("milestone");

    expect(schedule.dependencies).toHaveLength(2);

    expect(schedule.calendars).toHaveLength(1);
    expect(schedule.calendars[0]!.isDefault).toBe(true);
  });

  it("rejects a file with no <APIBusinessObjects> root", () => {
    expect(() => parseP6Xml("<NotP6/>")).toThrow(ScheduleImportRejectedError);
  });

  it("rejects malformed XML", () => {
    expect(() => parseP6Xml("<APIBusinessObjects><Activity>")).toThrow(ScheduleImportRejectedError);
  });
});
