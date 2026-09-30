import { describe, expect, it } from "vitest";
import { switchProjectPath } from "./project-switch";

describe("switchProjectPath", () => {
  it("keeps the screen type when switching project", () => {
    expect(switchProjectPath("/projects/a/punch-list", "a", "b")).toBe("/projects/b/punch-list");
  });
  it("drops the record id, which does not exist in the other project", () => {
    expect(switchProjectPath("/projects/a/rfis/123", "a", "b")).toBe("/projects/b/rfis");
  });
  it("goes to the project home from the home screen", () => {
    expect(switchProjectPath("/projects/a", "a", "b")).toBe("/projects/b");
  });
  it("falls back to the project home for an unexpected path", () => {
    expect(switchProjectPath("/login", "a", "b")).toBe("/projects/b");
  });
});
