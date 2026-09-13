import type { SubmittalReportData } from "../services/submittal.service";
import { PdfBuilder } from "./pdf-builder";

function responseCodeLabel(code: string | null): string {
  if (!code) return "Pending";
  return { approved: "Approved", approved_as_noted: "Approved as noted", revise_resubmit: "Revise & resubmit", rejected: "Rejected" }[code] ?? code;
}

export async function generateSubmittalPdf(data: SubmittalReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();
  await pdf.drawLetterhead(data.companyName, data.logoPngBytes);

  pdf.drawLine("Submittal", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`${data.number} — ${data.title}`, { size: 14, gap: 12 });

  pdf.drawLine(`Project: ${data.projectName}`);
  pdf.drawLine(`Spec section: ${data.specSectionLabel}`);
  pdf.drawLine(`Status: ${data.status}`);
  if (data.ballInCourtName) pdf.drawLine(`Ball in court: ${data.ballInCourtName}`);
  if (data.leadTimeDays !== null) pdf.drawLine(`Lead time: ${data.leadTimeDays} days`);
  if (data.requiredOnSiteDate) pdf.drawLine(`Required on site: ${data.requiredOnSiteDate.toISOString().slice(0, 10)}`);
  pdf.addSpacer(10);

  pdf.drawLine("Revisions & review chain", { size: 13, bold: true, gap: 8 });
  if (data.revisions.length === 0) {
    pdf.drawLine("No revisions submitted yet.", { size: 11, color: [0.44, 0.5, 0.58] });
  }
  for (const revision of data.revisions) {
    pdf.ensureSpace(24);
    pdf.drawLine(`Revision ${revision.revisionNumber} — submitted ${revision.submittedDate.toISOString().slice(0, 10)}`, {
      size: 12,
      bold: true,
      gap: 6,
    });
    for (const review of revision.reviews) {
      pdf.ensureSpace(16);
      const parallelNote = review.isParallel ? " (parallel)" : "";
      const reviewedLine = review.reviewedAt
        ? `${responseCodeLabel(review.responseCode)} — ${review.reviewedAt.toISOString().slice(0, 10)}`
        : responseCodeLabel(review.responseCode);
      pdf.drawLine(`  ${review.sequenceOrder}. ${review.reviewerName}${parallelNote}: ${reviewedLine}`, { size: 10, gap: 4 });
    }
    pdf.addSpacer(8);
  }

  return pdf.save();
}
