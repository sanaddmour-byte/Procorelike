import type { RfiReportData } from "../services/rfi.service";
import { PdfBuilder } from "./pdf-builder";

export async function generateRfiPdf(data: RfiReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();
  await pdf.drawLetterhead(data.companyName, data.logoPngBytes);

  pdf.drawLine("Request for Information", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`${data.number} — ${data.subject}`, { size: 14, gap: 12 });

  pdf.drawLine(`Project: ${data.projectName}`);
  pdf.drawLine(`Status: ${data.status}${data.isOverdue ? " (OVERDUE)" : ""}`, { color: data.isOverdue ? [0.6, 0.2, 0.2] : undefined });
  if (data.isPrivate) pdf.drawLine("Private", { color: [0.6, 0.2, 0.2] });
  if (data.reference) pdf.drawLine(`Reference: ${data.reference}`);
  if (data.dueDate) pdf.drawLine(`Due: ${data.dueDate.toISOString().slice(0, 10)}`);
  if (data.ballInCourtName) pdf.drawLine(`Ball in court: ${data.ballInCourtName}${data.ballInCourtCompanyName ? ` (${data.ballInCourtCompanyName})` : ""}`);
  if (data.costImpact !== "na") pdf.drawLine(`Cost impact: ${data.costImpact === "yes" ? "Yes" : "No"}`, { color: data.costImpact === "yes" ? [0.6, 0.4, 0.05] : undefined });
  if (data.scheduleImpact !== "na") pdf.drawLine(`Schedule impact: ${data.scheduleImpact === "yes" ? "Yes" : "No"}`, { color: data.scheduleImpact === "yes" ? [0.6, 0.4, 0.05] : undefined });
  pdf.addSpacer(4);

  pdf.drawLine("Question", { size: 13, bold: true, gap: 8 });
  for (const line of data.question.split("\n")) pdf.drawLine(line, { size: 11, gap: 4 });
  pdf.addSpacer(10);

  pdf.drawLine("Responses", { size: 13, bold: true, gap: 8 });
  if (data.responses.length === 0) {
    pdf.drawLine("No responses yet.", { size: 11, color: [0.44, 0.5, 0.58] });
  }
  for (const response of data.responses) {
    pdf.ensureSpace(32);
    const label = response.isOfficial ? `${response.respondedByName} (official response)` : response.respondedByName;
    pdf.drawLine(label, { size: 11, bold: true, gap: 2 });
    pdf.drawLine(`${response.createdAt.toISOString().slice(0, 10)}`, { size: 9, color: [0.44, 0.5, 0.58], gap: 4 });
    for (const line of response.responseText.split("\n")) pdf.drawLine(line, { size: 10, gap: 2 });
    pdf.addSpacer(8);
  }

  return pdf.save();
}
