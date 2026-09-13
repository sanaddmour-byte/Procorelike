import { PdfBuilder } from "./pdf-builder";
import type { InspectionReportData } from "../services/inspection.service";

/** Builds a signed inspection report as a PDF (Phase 5); see PdfBuilder for the shared drawing primitives every report generator uses. */
export async function generateInspectionReportPdf(data: InspectionReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();

  pdf.drawLine("Inspection Report", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(data.templateTitle, { size: 14, gap: 12 });

  pdf.drawLine(`Project: ${data.projectName}`);
  if (data.locationName) pdf.drawLine(`Location: ${data.locationName}`);
  if (data.scheduledAt) pdf.drawLine(`Scheduled: ${data.scheduledAt.toISOString().slice(0, 10)}`);
  if (data.performedByName) pdf.drawLine(`Performed by: ${data.performedByName}`);
  pdf.drawLine(`Status: ${data.status}`, { gap: 14 });

  pdf.drawLine("Checklist", { size: 13, bold: true, gap: 8 });
  for (const item of data.items) {
    pdf.ensureSpace(28);
    pdf.drawLine(`• ${item.prompt}`, { size: 11, gap: 2 });
    let resultLine = `   Response: ${item.valueLabel}`;
    if (item.generatedPunchItemNumber) resultLine += `  (Punch item ${item.generatedPunchItemNumber} created)`;
    pdf.drawLine(resultLine, { size: 10, color: [0.29, 0.33, 0.41], gap: 10 });
  }

  pdf.ensureSpace(60);
  pdf.addSpacer(10);
  pdf.drawLine("Sign-off", { size: 13, bold: true, gap: 8 });
  if (data.signedByName) {
    pdf.drawLine(data.signedByName, { size: 14, bold: true, gap: 2 });
    pdf.drawUnderline();
    if (data.signedAt) pdf.drawLine(`Signed ${data.signedAt.toISOString().replace("T", " ").slice(0, 16)} UTC`, { size: 9, color: [0.44, 0.5, 0.58] });
  } else {
    pdf.drawLine("Not yet signed", { size: 11, color: [0.6, 0.2, 0.2] });
  }

  return pdf.save();
}
