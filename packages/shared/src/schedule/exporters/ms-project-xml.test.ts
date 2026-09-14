import { describe, expect, it } from "vitest";
import { parseMsProjectXml } from "../importers/ms-project-xml";
import { buildMsProjectXml, type BuildMsProjectXmlInput } from "./ms-project-xml";

const INPUT: BuildMsProjectXmlInput = {
  projectName: "Round Trip Test",
  dataDate: "2024-01-01",
  calendars: [{ id: "cal-1", name: "Sun-Thu", isDefault: true, workingDays: 0b0011111 }],
  tasks: [
    {
      id: "t-summary",
      name: "Phase 1",
      taskType: "summary",
      wbsCode: "1",
      isCritical: false,
      percentComplete: 0,
      sortOrder: 0,
      calendarId: "cal-1",
    },
    {
      id: "t-a",
      parentTaskId: "t-summary",
      name: "Task A",
      taskType: "task",
      wbsCode: "1-1",
      durationMinutes: 960,
      earlyStart: new Date("2024-01-07T08:00:00Z"),
      earlyFinish: new Date("2024-01-08T16:00:00Z"),
      totalFloatMinutes: 0,
      freeFloatMinutes: 0,
      isCritical: true,
      percentComplete: 50,
      constraintType: "asap",
      sortOrder: 1,
      calendarId: "cal-1",
    },
    {
      id: "t-b",
      parentTaskId: "t-summary",
      name: "Task B",
      taskType: "task",
      wbsCode: "1.2",
      durationMinutes: 480,
      earlyStart: new Date("2024-01-09T08:00:00Z"),
      earlyFinish: new Date("2024-01-09T16:00:00Z"),
      totalFloatMinutes: 480,
      freeFloatMinutes: 480,
      isCritical: false,
      percentComplete: 0,
      sortOrder: 2,
      calendarId: "cal-1",
    },
  ],
  dependencies: [{ predecessorId: "t-a", successorId: "t-b", type: "FS", lagMinutes: 60 }],
};

describe("buildMsProjectXml", () => {
  it("produces XML the importer accepts back", () => {
    const xml = buildMsProjectXml(INPUT);
    const parsed = parseMsProjectXml(xml);
    expect(parsed.tasks).toHaveLength(3);
    expect(parsed.calendars).toHaveLength(1);
    expect(parsed.dependencies).toHaveLength(1);
  });

  it("preserves task names, WBS codes, hierarchy, and duration", () => {
    const xml = buildMsProjectXml(INPUT);
    const parsed = parseMsProjectXml(xml);
    const taskA = parsed.tasks.find((t) => t.name === "Task A");
    expect(taskA).toBeDefined();
    expect(taskA?.wbsCode).toBe("1-1");
    expect(taskA?.durationMinutes).toBe(960);
    expect(taskA?.percentComplete).toBe(50);
    expect(taskA?.isCritical).toBe(true);

    const summary = parsed.tasks.find((t) => t.name === "Phase 1");
    expect(summary?.taskType).toBe("summary");
    const parentExternalId = summary?.externalId;
    expect(taskA?.parentExternalId).toBe(parentExternalId);
  });

  it("preserves the dependency type and lag", () => {
    const xml = buildMsProjectXml(INPUT);
    const parsed = parseMsProjectXml(xml);
    const dep = parsed.dependencies[0];
    expect(dep?.type).toBe("FS");
    expect(dep?.lagMinutes).toBe(60);
  });

  it("preserves the calendar's working-day bitmask", () => {
    const xml = buildMsProjectXml(INPUT);
    const parsed = parseMsProjectXml(xml);
    expect(parsed.calendars[0]?.workingDays).toBe(0b0011111);
  });
});
