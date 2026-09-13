import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ScheduleImportRejectedError } from "../types";
import { parseMsProjectXml } from "./ms-project-xml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../../fixtures/schedules");

describe("parseMsProjectXml", () => {
  it("parses the sample-msproject.xml fixture into a ParsedSchedule", () => {
    const xmlText = readFileSync(join(fixturesDir, "sample-msproject.xml"), "utf-8");
    const schedule = parseMsProjectXml(xmlText);

    expect(schedule.sourceTool).toBe("ms_project_xml");
    expect(schedule.name).toBe("Amman Heights - Substructure");
    expect(schedule.dataDate).toBe("2026-01-01");
    expect(schedule.warnings).toEqual([]);

    // The synthetic UID=0 project-root task is excluded.
    expect(schedule.tasks).toHaveLength(5);

    const summary = schedule.tasks.find((t) => t.externalId === "1")!;
    expect(summary.taskType).toBe("summary");
    expect(summary.percentComplete).toBe(32);

    const mobilization = schedule.tasks.find((t) => t.externalId === "2")!;
    expect(mobilization.parentExternalId).toBe("1");
    expect(mobilization.taskType).toBe("task");
    expect(mobilization.durationMinutes).toBe(8 * 60);
    expect(mobilization.isCritical).toBe(true);

    const foundation = schedule.tasks.find((t) => t.externalId === "4")!;
    expect(foundation.constraintType).toBe("asap");

    const milestone = schedule.tasks.find((t) => t.externalId === "5")!;
    expect(milestone.taskType).toBe("milestone");
    expect(milestone.durationMinutes).toBe(0);

    expect(schedule.dependencies).toHaveLength(3);
    expect(schedule.dependencies).toContainEqual({
      predecessorExternalId: "2",
      successorExternalId: "3",
      type: "FS",
      lagMinutes: 0,
    });

    expect(schedule.calendars).toHaveLength(1);
    expect(schedule.calendars[0]!.name).toBe("Standard (Sun-Thu)");
    // Sun-Thu working (bits 0-4 set): 0b0011111 = 31.
    expect(schedule.calendars[0]!.workingDays).toBe(31);
  });

  it("rejects a file with no <Project> root", () => {
    expect(() => parseMsProjectXml("<NotAProject/>")).toThrow(ScheduleImportRejectedError);
  });

  it("rejects malformed XML", () => {
    expect(() => parseMsProjectXml("<Project><Tasks><Task>")).toThrow(ScheduleImportRejectedError);
  });

  it("rejects a circular dependency between two tasks", () => {
    const xml = `<Project>
      <Tasks>
        <Task><UID>1</UID><Name>A</Name><OutlineLevel>1</OutlineLevel>
          <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type></PredecessorLink>
        </Task>
        <Task><UID>2</UID><Name>B</Name><OutlineLevel>1</OutlineLevel>
          <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink>
        </Task>
      </Tasks>
    </Project>`;
    expect(() => parseMsProjectXml(xml)).toThrow(ScheduleImportRejectedError);
  });
});
