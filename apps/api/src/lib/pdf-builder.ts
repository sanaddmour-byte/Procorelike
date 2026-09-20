import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "fs";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { prepareBidiLine } from "./bidi-text";

const PAGE_WIDTH = 595.28; // A4, points -- the default page size for every export (RFI/Submittal/Change Order/Correspondence/Inspection, single-item and summary alike)
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

/**
 * Noto Sans Arabic (SIL OFL 1.1, apps/api/assets/fonts/LICENSE-NotoSansArabic.txt)
 * covers Latin + digits + common punctuation *and* Arabic in one font file
 * (confirmed via @pdf-lib/fontkit glyph-coverage checks before adopting it),
 * so it replaces pdf-lib's built-in Helvetica/HelveticaBold everywhere in
 * this builder rather than switching fonts per line by content -- one font
 * pair, always, is simpler and carries no risk of a line that mixes scripts
 * hitting a font that can only cover half of it.
 */
const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");
const REGULAR_FONT_PATH = join(FONTS_DIR, "NotoSansArabic-Regular.ttf");
const BOLD_FONT_PATH = join(FONTS_DIR, "NotoSansArabic-Bold.ttf");

export interface DrawLineOptions {
  size?: number;
  bold?: boolean;
  color?: [number, number, number];
  gap?: number;
}

export interface TableColumn {
  header: string;
  /** Column width in points; a table's column widths should sum to at most PAGE_WIDTH - MARGIN*2 (495.28 at A4). */
  width: number;
}

/**
 * Shared plain text/line-drawing PDF builder (the locked stack's "generate"
 * tool, pdf-lib -- CLAUDE.md §3; no template engine, no headless browser).
 * Extracted from inspection-report.ts (Phase 5) so every report generator
 * (RFI/Submittal/Change Order/Correspondence, Phase 12) shares the same
 * pagination and a common branded letterhead instead of five copies of the
 * same drawLine/newPageIfNeeded logic.
 */
export class PdfBuilder {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private boldFont!: PDFFont;
  private page!: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;

  private constructor() {}

  static async create(): Promise<PdfBuilder> {
    const builder = new PdfBuilder();
    builder.doc = await PDFDocument.create();
    builder.doc.registerFontkit(fontkit);
    // subset: true keeps the embedded font to just the glyphs actually used --
    // the full Noto Sans Arabic file is ~190KB per weight, most of which is
    // Arabic-script glyphs no all-English report will ever draw.
    builder.font = await builder.doc.embedFont(readFileSync(REGULAR_FONT_PATH), { subset: true });
    builder.boldFont = await builder.doc.embedFont(readFileSync(BOLD_FONT_PATH), { subset: true });
    builder.page = builder.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    return builder;
  }

  /** Starts a fresh page if fewer than `minRemaining` points remain above the bottom margin -- exposed so a caller can keep a multi-line block (e.g. a checklist item's prompt + response) from splitting across a page break. */
  ensureSpace(minRemaining: number): void {
    if (this.y < MARGIN + minRemaining) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  /** Greedy word-wrap to a given width (defaults to the page's full text width) -- without this, a line longer than the available width (any real RFI question or correspondence body, or a table cell) just runs off the edge and gets clipped rather than wrapping. */
  private wrapText(text: string, size: number, font: PDFFont, maxWidth: number = PAGE_WIDTH - MARGIN * 2): string[] {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];

    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  drawLine(text: string, options: DrawLineOptions = {}): void {
    const size = options.size ?? 11;
    const usedFont = options.bold ? this.boldFont : this.font;
    const color = options.color ? rgb(...options.color) : rgb(0.06, 0.09, 0.16);
    const gap = options.gap ?? 6;
    // Continuation lines within one word-wrapped block use standard single-spacing (~1.35x
    // the font size) rather than a flat 2pt, which read as cramped for long RFI/correspondence
    // bodies -- the exact text most likely to actually wrap.
    const continuationGap = Math.round(size * 0.35);

    // Word-wrap on the original logical text -- wrapping decisions (where a line
    // breaks) must not depend on the bidi reordering below, which only changes
    // draw order/alignment for the line as a whole, not its content or width.
    const wrapped = this.wrapText(text, size, usedFont);
    wrapped.forEach((line, i) => {
      const isLast = i === wrapped.length - 1;
      this.ensureSpace(size + (isLast ? gap : continuationGap));
      const { text: drawnText, rtl } = prepareBidiLine(line);
      const x = rtl ? PAGE_WIDTH - MARGIN - usedFont.widthOfTextAtSize(drawnText, size) : MARGIN;
      this.page.drawText(drawnText, { x, y: this.y, size, font: usedFont, color });
      this.y -= size + (isLast ? gap : continuationGap);
    });
  }

  /** A short horizontal rule under the current line, e.g. a signature underline -- drawn at the position drawLine just left off, so call it right after the line it underlines. */
  drawUnderline(widthPoints = 220): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 12 },
      end: { x: MARGIN + widthPoints, y: this.y + 12 },
      thickness: 0.5,
      color: rgb(0.6, 0.65, 0.72),
    });
  }

  addSpacer(gap: number): void {
    this.ensureSpace(gap);
    this.y -= gap;
  }

  /**
   * A register/summary table -- a header row plus one row per item, each cell
   * word-wrapped to its column's width. Used by the "export all" list reports
   * (RFI/Submittal/Change Order/Correspondence/Inspection registers) alongside
   * the five single-item report generators. Repeats the header on every page
   * the table spans, so a long register stays readable across a page break.
   */
  drawTable(columns: TableColumn[], rows: string[][]): void {
    const headerSize = 9;
    const cellSize = 9;
    const lineHeight = cellSize + 3;
    const rowPadding = 6;
    const startX = MARGIN;
    const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);

    const drawHeaderRow = (): void => {
      this.ensureSpace(headerSize + rowPadding + 8);
      let x = startX;
      for (const col of columns) {
        this.page.drawText(col.header, { x, y: this.y, size: headerSize, font: this.boldFont, color: rgb(0.06, 0.09, 0.16) });
        x += col.width;
      }
      this.y -= headerSize + 4;
      this.page.drawLine({
        start: { x: startX, y: this.y },
        end: { x: startX + totalWidth, y: this.y },
        thickness: 0.75,
        color: rgb(0.6, 0.65, 0.72),
      });
      this.y -= rowPadding;
    };

    drawHeaderRow();

    for (const row of rows) {
      const wrappedCells = row.map((cell, i) => this.wrapText(cell, cellSize, this.font, columns[i]!.width - 6));
      const lineCount = Math.max(...wrappedCells.map((lines) => lines.length), 1);
      const rowHeight = lineCount * lineHeight + rowPadding;

      const pageBefore = this.page;
      this.ensureSpace(rowHeight);
      if (this.page !== pageBefore) drawHeaderRow();

      let x = startX;
      const rowTopY = this.y;
      columns.forEach((col, i) => {
        wrappedCells[i]!.forEach((line, lineIndex) => {
          const { text: drawnText, rtl } = prepareBidiLine(line);
          const cellX = rtl ? x + col.width - 6 - this.font.widthOfTextAtSize(drawnText, cellSize) : x;
          this.page.drawText(drawnText, { x: cellX, y: rowTopY - lineIndex * lineHeight, size: cellSize, font: this.font, color: rgb(0.15, 0.18, 0.24) });
        });
        x += col.width;
      });
      this.y = rowTopY - lineCount * lineHeight - rowPadding;
    }
  }

  /**
   * Embeds a PNG company logo top-left with the company name beside it, and
   * drops the y-cursor below it -- call once, before any drawLine calls.
   * A company with no logo (or a corrupt/unsupported one) gets a bordered
   * placeholder box with its initials in the same spot instead, so every
   * letterhead keeps the same visual anchor rather than the name floating
   * with nothing to its left on some reports and a logo on others.
   */
  async drawLetterhead(companyName: string | null, logoPngBytes: Uint8Array | null): Promise<void> {
    const LOGO_MAX_HEIGHT = 40;
    const LOGO_MAX_WIDTH = 140;

    if (logoPngBytes) {
      try {
        const image = await this.doc.embedPng(logoPngBytes);
        // Scale to fill the letterhead box, capped at 4x so a genuinely tiny source image
        // (an icon-sized upload) doesn't blow up into a blocky mess -- but uncapped below
        // 1x, since the old "never upscale" rule left small-but-reasonable logos (e.g. a
        // 48px square) rendering as a barely visible speck instead of filling the box.
        const scale = Math.min(LOGO_MAX_WIDTH / image.width, LOGO_MAX_HEIGHT / image.height, 4);
        const width = image.width * scale;
        const height = image.height * scale;
        this.page.drawImage(image, { x: MARGIN, y: this.y - height, width, height });
        this.drawLetterheadCompanyName(companyName, width, height);
        this.y -= height + 14;
        return;
      } catch {
        // fall through to the placeholder branch below
      }
    }

    if (!companyName) return;

    const boxHeight = LOGO_MAX_HEIGHT;
    const boxWidth = LOGO_MAX_HEIGHT; // square placeholder, not the full logo width -- it holds only a couple of initials
    const initials = companyName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("");

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - boxHeight,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(0.6, 0.65, 0.72),
      borderWidth: 1,
      borderDashArray: [3, 2],
    });
    if (initials) {
      const size = 14;
      const textWidth = this.boldFont.widthOfTextAtSize(initials, size);
      this.page.drawText(initials, {
        x: MARGIN + (boxWidth - textWidth) / 2,
        y: this.y - boxHeight / 2 - size / 2 + 3,
        size,
        font: this.boldFont,
        color: rgb(0.44, 0.5, 0.58),
      });
    }
    this.drawLetterheadCompanyName(companyName, boxWidth, boxHeight);
    this.y -= boxHeight + 14;
  }

  private drawLetterheadCompanyName(companyName: string | null, anchorWidth: number, anchorHeight: number): void {
    if (!companyName) return;
    // Anchored beside the logo/placeholder box rather than spanning the full text
    // width, so an RTL name only needs its character order fixed here, not a
    // right-aligned reposition against the page margin the way a full-width
    // line (drawLine) or table cell does.
    const { text: drawnText } = prepareBidiLine(companyName);
    this.page.drawText(drawnText, {
      x: MARGIN + anchorWidth + 10,
      y: this.y - anchorHeight / 2 - 5,
      size: 12,
      font: this.boldFont,
      color: rgb(0.06, 0.09, 0.16),
    });
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
