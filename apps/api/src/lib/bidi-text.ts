// Character ranges are built from escaped codepoints via the RegExp constructor
// (not a /.../ literal) so this source file stays plain ASCII rather than embedding
// literal Arabic/Hebrew/BOM-lookalike characters that trip up whitespace linting.
const RTL_CHAR_RANGE = new RegExp("[\\u0590-\\u05FF\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF]");
const LTR_LETTER_RANGE = new RegExp("[A-Za-z\\u00C0-\\u024F]");

function isRtlChar(ch: string): boolean {
  return RTL_CHAR_RANGE.test(ch);
}

function isLtrLetter(ch: string): boolean {
  return LTR_LETTER_RANGE.test(ch);
}

/**
 * First-strong-character heuristic (a simplified stand-in for the
 * Unicode Bidirectional Algorithm's P2/P3 rules): the first letter --
 * Latin or an RTL script (Arabic/Hebrew) -- found in the string decides
 * its base direction. Digits, punctuation, and whitespace are direction-
 * neutral and skipped over, so "RFI-102" and "" both read as LTR (no
 * letters at all defaults to LTR, matching every pre-existing caller's
 * expectation), while "<Arabic text> RFI-102" reads as RTL.
 */
function isRtlDominant(text: string): boolean {
  for (const ch of text) {
    if (isRtlChar(ch)) return true;
    if (isLtrLetter(ch)) return false;
  }
  return false;
}

export interface BidiLine {
  /** The text to actually draw, left-to-right, at the position `rtl` implies. */
  text: string;
  /** True if this line should be right-aligned within its available width rather than left-aligned. */
  rtl: boolean;
}

/**
 * pdf-lib's `drawText` has no bidi or shaping support at all -- it places
 * each character left-to-right in string order. For Arabic/Hebrew text
 * typed in normal logical order, that both reads backwards (right-to-
 * left script drawn left-to-right) and never joins Arabic letters into
 * their contextual forms (each letter renders in isolated form). Full
 * correctness needs a real shaping engine (e.g. HarfBuzz) to produce
 * joined glyphs -- out of scope here and flagged as follow-up in
 * docs/DATA_MODEL.md. This function only fixes the reading-direction
 * half of the problem: a pragmatic word-level reordering (reverse word
 * order, and reverse the characters within any RTL-dominant word) that
 * reads naturally for the common case -- a field that's entirely Arabic,
 * or Arabic with an embedded English code/number/date -- without a full
 * Unicode Bidirectional Algorithm implementation.
 *
 * LTR-dominant text -- including plain English, which is most existing
 * report content -- is returned completely unchanged: this function is a
 * no-op for every report that predates it.
 */
export function prepareBidiLine(text: string): BidiLine {
  if (!isRtlDominant(text)) return { text, rtl: false };

  const words = text.split(" ");
  const reordered = words.reverse().map((word) => (isRtlDominant(word) ? [...word].reverse().join("") : word));
  return { text: reordered.join(" "), rtl: true };
}
