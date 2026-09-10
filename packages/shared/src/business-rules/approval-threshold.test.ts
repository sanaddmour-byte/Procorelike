import { describe, expect, it } from "vitest";
import { isValidSecondApprover, requiresSecondApprover, type Approver } from "./approval-threshold";

describe("requiresSecondApprover", () => {
  it("does not require a second approver below the threshold", () => {
    expect(requiresSecondApprover(4999, 5000)).toBe(false);
  });

  it("requires a second approver at the threshold", () => {
    expect(requiresSecondApprover(5000, 5000)).toBe(true);
  });

  it("requires a second approver above the threshold", () => {
    expect(requiresSecondApprover(10000, 5000)).toBe(true);
  });

  it("uses the absolute value so a credit change order is also checked", () => {
    expect(requiresSecondApprover(-6000, 5000)).toBe(true);
  });
});

describe("isValidSecondApprover", () => {
  const gcPm: Approver = { userId: "u1", companyId: "gc", role: "project_manager" };
  const gcSuper: Approver = { userId: "u2", companyId: "gc", role: "superintendent" };
  const ownerRep: Approver = { userId: "u3", companyId: "owner", role: "client_viewer" };

  it("rejects the same user approving twice", () => {
    expect(isValidSecondApprover(gcPm, { ...gcPm })).toBe(false);
  });

  it("rejects a second approver from the same company as the first", () => {
    expect(isValidSecondApprover(gcPm, gcSuper)).toBe(false);
  });

  it("accepts a second approver from a different company", () => {
    expect(isValidSecondApprover(gcPm, ownerRep)).toBe(true);
  });
});
