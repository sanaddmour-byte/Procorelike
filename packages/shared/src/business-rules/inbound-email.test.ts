import { describe, expect, it } from "vitest";
import { extractInboundToken, extractSenderAddress, parseEmailAddresses } from "./inbound-email";

describe("parseEmailAddresses", () => {
  it("extracts a plain address", () => {
    expect(parseEmailAddresses("jane@acme.com")).toEqual(["jane@acme.com"]);
  });

  it("strips a display name wrapping the address", () => {
    expect(parseEmailAddresses("Jane Doe <jane@acme.com>")).toEqual(["jane@acme.com"]);
  });

  it("splits multiple comma-separated recipients and lowercases them", () => {
    expect(parseEmailAddresses("Jane <Jane@Acme.com>, Bob@Sub.Com")).toEqual(["jane@acme.com", "bob@sub.com"]);
  });

  it("drops parts with no @ instead of throwing", () => {
    expect(parseEmailAddresses("not-an-address, jane@acme.com")).toEqual(["jane@acme.com"]);
  });

  it("returns an empty array for an empty header", () => {
    expect(parseEmailAddresses("")).toEqual([]);
  });
});

describe("extractInboundToken", () => {
  const DOMAIN = "inbound.siteops.local";

  it("returns the local part of the address matching the inbound domain", () => {
    expect(extractInboundToken("a1b2c3@inbound.siteops.local", DOMAIN)).toBe("a1b2c3");
  });

  it("finds the matching recipient among several, ignoring unrelated ones", () => {
    const to = "Jane <jane@acme.com>, <a1b2c3@inbound.siteops.local>, bob@sub.com";
    expect(extractInboundToken(to, DOMAIN)).toBe("a1b2c3");
  });

  it("is case-insensitive on the domain", () => {
    expect(extractInboundToken("a1b2c3@INBOUND.SITEOPS.LOCAL", DOMAIN)).toBe("a1b2c3");
  });

  it("returns null when no recipient matches the inbound domain", () => {
    expect(extractInboundToken("jane@acme.com, bob@sub.com", DOMAIN)).toBeNull();
  });

  it("returns null for an empty header", () => {
    expect(extractInboundToken("", DOMAIN)).toBeNull();
  });
});

describe("extractSenderAddress", () => {
  it("returns the first address in the header", () => {
    expect(extractSenderAddress("Jane Doe <jane@acme.com>")).toBe("jane@acme.com");
  });

  it("returns null when the header has no address", () => {
    expect(extractSenderAddress("")).toBeNull();
  });
});
