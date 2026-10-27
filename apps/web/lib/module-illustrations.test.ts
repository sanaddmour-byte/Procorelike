import { describe, expect, it } from "vitest";
import { moduleIllustration, moduleIllustrationFor } from "./module-illustrations";

describe("moduleIllustrationFor", () => {
  it("maps a list page to its illustration", () => {
    expect(moduleIllustrationFor("/en/projects/abc/rfis")).toBe("/images/modules/rfis.png");
  });
  it("shares one illustration across related pages", () => {
    expect(moduleIllustrationFor("/ar/projects/abc/change-orders")).toBe("/images/modules/finance.png");
    expect(moduleIllustrationFor("/en/projects/abc/gantt")).toBe("/images/modules/schedule.png");
  });
  it("shows nothing on record pages, unknown pages or non-project pages", () => {
    expect(moduleIllustrationFor("/en/projects/abc/rfis/123")).toBeNull();
    expect(moduleIllustrationFor("/en/projects/abc/settings")).toBeNull();
    expect(moduleIllustrationFor("/en/login")).toBeNull();
  });

  it("returns a smaller variant for record pages", () => {
    expect(moduleIllustration("/en/projects/abc/rfis/123")).toEqual({ src: "/images/modules/rfis.png", detail: true });
    expect(moduleIllustration("/en/projects/abc/rfis")).toEqual({ src: "/images/modules/rfis.png", detail: false });
  });
});
