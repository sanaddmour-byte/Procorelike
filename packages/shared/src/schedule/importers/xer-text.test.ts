import { describe, expect, it } from "vitest";
import { parseXerText } from "./xer-text";

describe("parseXerText", () => {
  it("parses table sections into rows keyed by field name", () => {
    const text = ["ERMHDR\t21.12\t2026-01-01", "%T\tTASK", "%F\ttask_id\ttask_name", "%R\tT1\tMobilization", "%R\tT2\tExcavation", "%E"].join(
      "\n",
    );
    const tables = parseXerText(text);
    expect(tables.TASK).toHaveLength(2);
    expect(tables.TASK![0]).toEqual({ task_id: "T1", task_name: "Mobilization" });
    expect(tables.TASK![1]).toEqual({ task_id: "T2", task_name: "Excavation" });
  });

  it("supports multiple tables in one file", () => {
    const text = [
      "ERMHDR\t21.12",
      "%T\tPROJECT",
      "%F\tproj_id",
      "%R\tP1",
      "%T\tTASK",
      "%F\ttask_id\ttask_name",
      "%R\tT1\tMobilization",
      "%E",
    ].join("\n");
    const tables = parseXerText(text);
    expect(tables.PROJECT).toEqual([{ proj_id: "P1" }]);
    expect(tables.TASK).toEqual([{ task_id: "T1", task_name: "Mobilization" }]);
  });

  it("pads a short row with empty strings for missing trailing fields", () => {
    const text = ["%T\tTASK", "%F\ttask_id\ttask_name\ttask_code", "%R\tT1\tMobilization"].join("\n");
    const tables = parseXerText(text);
    expect(tables.TASK![0]).toEqual({ task_id: "T1", task_name: "Mobilization", task_code: "" });
  });
});
