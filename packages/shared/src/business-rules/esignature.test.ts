import { describe, expect, it } from "vitest";
import { stableStringify } from "./esignature";

describe("stableStringify", () => {
  it("is independent of key order at every nesting level", () => {
    const a = { subject: "Notice of delay", meta: { from: "gc", to: "owner" } };
    const b = { meta: { to: "owner", from: "gc" }, subject: "Notice of delay" };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("distinguishes content that actually differs", () => {
    const a = { body: "Original text" };
    const b = { body: "Edited text" };
    expect(stableStringify(a)).not.toBe(stableStringify(b));
  });

  it("preserves array order (arrays are ordered data, unlike object keys)", () => {
    const a = { responses: [{ id: "1" }, { id: "2" }] };
    const b = { responses: [{ id: "2" }, { id: "1" }] };
    expect(stableStringify(a)).not.toBe(stableStringify(b));
  });

  it("treats null and undefined the same way", () => {
    expect(stableStringify(null)).toBe(stableStringify(undefined));
  });
});
