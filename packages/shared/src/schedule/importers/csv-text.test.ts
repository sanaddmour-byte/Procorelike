import { describe, expect, it } from "vitest";
import { parseCsvText } from "./csv-text";

describe("parseCsvText", () => {
  it("parses a simple comma-separated grid", () => {
    expect(parseCsvText("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    expect(parseCsvText('a,"b, still b",c\n1,2,3')).toEqual([
      ["a", "b, still b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles an escaped quote inside a quoted field", () => {
    expect(parseCsvText('a,"say ""hi""",c')).toEqual([["a", 'say "hi"', "c"]]);
  });

  it("handles a quoted field containing an embedded newline", () => {
    expect(parseCsvText('a,"line1\nline2",c')).toEqual([["a", "line1\nline2", "c"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsvText("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not emit a phantom trailing row for a final newline", () => {
    expect(parseCsvText("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
