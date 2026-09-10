import { describe, expect, it } from "vitest";
import {
  formatChangeOrderNumber,
  formatPunchItemNumber,
  formatRfiNumber,
  formatSequenceNumber,
  formatSubmittalNumber,
} from "./numbering";

describe("numbering formatters", () => {
  it("formats an RFI number zero-padded to 4 digits", () => {
    expect(formatRfiNumber(42)).toBe("RFI-0042");
  });

  it("formats a change order number zero-padded to 3 digits", () => {
    expect(formatChangeOrderNumber(7)).toBe("CO-007");
  });

  it("formats a punch item number zero-padded to 4 digits", () => {
    expect(formatPunchItemNumber(123)).toBe("PI-0123");
  });

  it("formats a submittal number with its spec section", () => {
    expect(formatSubmittalNumber("03.30.00", 2)).toBe("SUB-03.30.00-002");
  });

  it("does not truncate values wider than the pad length", () => {
    expect(formatSequenceNumber("RFI", 12345, 4)).toBe("RFI-12345");
  });

  it("rejects non-positive-integer values", () => {
    expect(() => formatSequenceNumber("RFI", 0)).toThrow();
    expect(() => formatSequenceNumber("RFI", -1)).toThrow();
    expect(() => formatSequenceNumber("RFI", 1.5)).toThrow();
  });
});
