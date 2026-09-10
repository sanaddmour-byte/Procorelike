import { describe, expect, it } from "vitest";
import {
  hasPermission,
  PermissionDeniedError,
  requirePermission,
  resolveEffectiveLevel,
  subcontractorCanSeeRecord,
  type PermissionContext,
} from "./engine";

function ctx(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    role: "project_manager",
    templateLevels: { rfis: "standard" },
    overrides: {},
    ...overrides,
  };
}

describe("resolveEffectiveLevel", () => {
  it("falls back to the template level when there is no override", () => {
    expect(resolveEffectiveLevel(ctx(), "rfis")).toBe("standard");
  });

  it("defaults to 'none' when neither template nor override set a level", () => {
    expect(resolveEffectiveLevel(ctx(), "budget")).toBe("none");
  });

  it("lets a per-user override win over the template default", () => {
    expect(
      resolveEffectiveLevel(ctx({ overrides: { rfis: "admin" } }), "rfis"),
    ).toBe("admin");
  });

  it("never grants a client_viewer access to a financial module, even if a template says admin", () => {
    const c = ctx({
      role: "client_viewer",
      templateLevels: { budget: "admin" },
      overrides: { budget: "admin" },
    });
    expect(resolveEffectiveLevel(c, "budget")).toBe("none");
  });

  it("does not restrict a client_viewer on non-financial modules", () => {
    const c = ctx({ role: "client_viewer", templateLevels: { photos: "read" } });
    expect(resolveEffectiveLevel(c, "photos")).toBe("read");
  });
});

describe("hasPermission / requirePermission", () => {
  it("returns true when the effective level meets the requirement", () => {
    expect(hasPermission(ctx(), "rfis", "read")).toBe(true);
    expect(hasPermission(ctx(), "rfis", "standard")).toBe(true);
  });

  it("returns false when the effective level is below the requirement", () => {
    expect(hasPermission(ctx(), "rfis", "admin")).toBe(false);
  });

  it("throws PermissionDeniedError when the requirement is not met", () => {
    expect(() => requirePermission(ctx(), "budget", "read")).toThrow(PermissionDeniedError);
  });

  it("does not throw when the requirement is met", () => {
    expect(() => requirePermission(ctx(), "rfis", "read")).not.toThrow();
  });
});

describe("subcontractorCanSeeRecord", () => {
  const companyA = "company-a";
  const companyB = "company-b";

  it("is unrestricted for non-subcontractor roles", () => {
    expect(
      subcontractorCanSeeRecord("project_manager", companyA, { assigneeCompanyId: companyB }),
    ).toBe(true);
  });

  it("allows a subcontractor to see a record where their company is the assignee", () => {
    expect(
      subcontractorCanSeeRecord("subcontractor", companyA, { assigneeCompanyId: companyA }),
    ).toBe(true);
  });

  it("allows a subcontractor to see a record where their company is ball-in-court", () => {
    expect(
      subcontractorCanSeeRecord("subcontractor", companyA, { ballInCourtCompanyId: companyA }),
    ).toBe(true);
  });

  it("allows a subcontractor to see a record where their company is on the distribution list", () => {
    expect(
      subcontractorCanSeeRecord("subcontractor", companyA, {
        distributionCompanyIds: [companyB, companyA],
      }),
    ).toBe(true);
  });

  it("denies a subcontractor a record with no relation to their company", () => {
    expect(
      subcontractorCanSeeRecord("subcontractor", companyA, {
        assigneeCompanyId: companyB,
        ballInCourtCompanyId: companyB,
        distributionCompanyIds: [companyB],
      }),
    ).toBe(false);
  });
});
