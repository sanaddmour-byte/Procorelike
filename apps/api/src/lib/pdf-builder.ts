import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 50;

export interface DrawLineOptions {
  size?: number;
  bold?: boolean;
  color?: [number, number, number];
  gap?: number;
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
    builder.font = await builder.doc.embedFont(StandardFonts.Helvetica);
    builder.boldFont = await builder.doc.embedFont(StandardFonts.HelveticaBold);
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

  /** Greedy word-wrap to the page's text width -- without this, a line longer than the margins (any real RFI question or correspondence body, not just short checklist prompts) just runs off the page edge and gets clipped rather than wrapping. */
  private wrapText(text: string, size: number, font: PDFFont): string[] {
    const maxWidth = PAGE_WIDTH - MARGIN * 2;
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

    const wrapped = this.wrapText(text, size, usedFont);
    wrapped.forEach((line, i) => {
      const isLast = i === wrapped.length - 1;
      this.ensureSpace(size + (isLast ? (options.gap ?? 4) : 2));
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: usedFont, color });
      this.y -= size + (isLast ? gap : 2);
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
   * Embeds a PNG company logo top-left with the company name beside it, and
   * drops the y-cursor below it -- call once, before any drawLine calls.
   * A company with no logo (or a corrupt/unsupported one) just gets the
   * name as a plain bold line instead, so report generation never fails
   * over branding.
   */
  async drawLetterhead(companyName: string | null, logoPngBytes: Uint8Array | null): Promise<void> {
    const LOGO_MAX_HEIGHT = 40;
    const LOGO_MAX_WIDTH = 140;

    if (logoPngBytes) {
      try {
        const image = await this.doc.embedPng(logoPngBytes);
        const scale = Math.min(LOGO_MAX_WIDTH / image.width, LOGO_MAX_HEIGHT / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        this.page.drawImage(image, { x: MARGIN, y: this.y - height, width, height });
        if (companyName) {
          this.page.drawText(companyName, {
            x: MARGIN + width + 10,
            y: this.y - height / 2 - 5,
            size: 12,
            font: this.boldFont,
            color: rgb(0.06, 0.09, 0.16),
          });
        }
        this.y -= height + 14;
        return;
      } catch {
        // fall through to the text-only branch below
      }
    }
    if (companyName) this.drawLine(companyName, { size: 12, bold: true, gap: 4 });
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
