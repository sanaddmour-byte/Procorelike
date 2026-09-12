import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { InspectionReportData } from "../services/inspection.service";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 50;

/**
 * Builds a signed inspection report as a PDF, from scratch with pdf-lib
 * (the locked stack's "generate" tool — CLAUDE.md §3). No template engine,
 * no headless browser: plain text/line drawing on a fresh page, wrapping
 * to additional pages as items run long.
 */
export async function generateInspectionReportPdf(data: InspectionReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPageIfNeeded(minRemaining: number): void {
    if (y < MARGIN + minRemaining) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawLine(text: string, options: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}): void {
    const size = options.size ?? 11;
    const usedFont = options.bold ? boldFont : font;
    const color = options.color ? rgb(...options.color) : rgb(0.06, 0.09, 0.16);
    newPageIfNeeded(size + (options.gap ?? 4));
    page.drawText(text, { x: MARGIN, y, size, font: usedFont, color });
    y -= size + (options.gap ?? 6);
  }

  drawLine("Inspection Report", { size: 20, bold: true, gap: 10 });
  drawLine(data.templateTitle, { size: 14, gap: 12 });

  drawLine(`Project: ${data.projectName}`);
  if (data.locationName) drawLine(`Location: ${data.locationName}`);
  if (data.scheduledAt) drawLine(`Scheduled: ${data.scheduledAt.toISOString().slice(0, 10)}`);
  if (data.performedByName) drawLine(`Performed by: ${data.performedByName}`);
  drawLine(`Status: ${data.status}`, { gap: 14 });

  drawLine("Checklist", { size: 13, bold: true, gap: 8 });
  for (const item of data.items) {
    newPageIfNeeded(28);
    drawLine(`• ${item.prompt}`, { size: 11, gap: 2 });
    let resultLine = `   Response: ${item.valueLabel}`;
    if (item.generatedPunchItemNumber) resultLine += `  (Punch item ${item.generatedPunchItemNumber} created)`;
    drawLine(resultLine, { size: 10, color: [0.29, 0.33, 0.41], gap: 10 });
  }

  newPageIfNeeded(60);
  y -= 10;
  drawLine("Sign-off", { size: 13, bold: true, gap: 8 });
  if (data.signedByName) {
    drawLine(data.signedByName, { size: 14, bold: true, gap: 2 });
    page.drawLine({
      start: { x: MARGIN, y: y + 12 },
      end: { x: MARGIN + 220, y: y + 12 },
      thickness: 0.5,
      color: rgb(0.6, 0.65, 0.72),
    });
    if (data.signedAt) drawLine(`Signed ${data.signedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`, { size: 9, color: [0.44, 0.5, 0.58] });
  } else {
    drawLine("Not yet signed", { size: 11, color: [0.6, 0.2, 0.2] });
  }

  return doc.save();
}
