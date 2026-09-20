import { describe, expect, it } from "vitest";
import { prepareBidiLine } from "./bidi-text";

/**
 * Phase 30's pragmatic word-level bidi fallback (docs/DATA_MODEL.md §9r) --
 * not a full Unicode Bidirectional Algorithm, just enough to make the
 * common cases (plain English, plain Arabic, Arabic with an embedded
 * English code/number) read in the right direction when drawn by
 * pdf-lib's naive left-to-right `drawText`.
 */
describe("prepareBidiLine", () => {
  it("leaves plain English text completely unchanged", () => {
    expect(prepareBidiLine("RFI-102 — Waterproofing at Level 4")).toEqual({
      text: "RFI-102 — Waterproofing at Level 4",
      rtl: false,
    });
  });

  it("leaves an empty string and pure punctuation/digits unchanged (no letters at all defaults to LTR)", () => {
    expect(prepareBidiLine("")).toEqual({ text: "", rtl: false });
    expect(prepareBidiLine("123-456")).toEqual({ text: "123-456", rtl: false });
  });

  it("reverses word order and each RTL word's characters for a pure-Arabic line", () => {
    const result = prepareBidiLine("مرحبا بالعالم");
    expect(result.rtl).toBe(true);
    // Word order reversed, and each word's own characters reversed too.
    expect(result.text).toBe([...("بالعالم")].reverse().join("") + " " + [...("مرحبا")].reverse().join(""));
  });

  it("keeps an embedded English code's character order intact within an RTL line", () => {
    const result = prepareBidiLine("طلب معلومات RFI-102");
    expect(result.rtl).toBe(true);
    // The LTR token "RFI-102" is not itself reversed, only repositioned by the word-order flip.
    expect(result.text.startsWith("RFI-102 ")).toBe(true);
    expect(result.text).not.toContain("201-IFR");
  });

  it("bases direction on the first strong (letter) character, skipping leading digits/punctuation", () => {
    expect(prepareBidiLine("2026-03-01: مرحبا").rtl).toBe(true);
    expect(prepareBidiLine("2026-03-01: Hello").rtl).toBe(false);
  });
});
