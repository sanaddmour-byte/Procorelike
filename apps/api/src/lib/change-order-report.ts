import type { ChangeOrderReportData } from "../services/change-management.service";
import { PdfBuilder } from "./pdf-builder";

export async function generateChangeOrderPdf(data: ChangeOrderReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();
  await pdf.drawLetterhead(data.companyName, data.logoPngBytes);

  pdf.drawLine("Change Order", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`${data.number}${data.title ? ` — ${data.title}` : ""}`, { size: 14, gap: 12 });

  pdf.drawLine(`Project: ${data.projectName}`);
  pdf.drawLine(`Target: ${data.targetType === "prime" ? "Prime contract (budget)" : "Commitment"}`);
  pdf.drawLine(`Cost impact: $${Number(data.costImpact).toLocaleString()}`);
  pdf.drawLine(`Time impact: ${data.timeImpactDays} days`);
  pdf.drawLine(`Status: ${data.status}`, { gap: 14 });

  if (data.description) {
    pdf.drawLine("Description", { size: 13, bold: true, gap: 8 });
    for (const line of data.description.split("\n")) pdf.drawLine(line, { size: 11, gap: 4 });
    pdf.addSpacer(10);
  }

  pdf.drawLine("Approval chain", { size: 13, bold: true, gap: 8 });
  if (data.approvals.length === 0) {
    pdf.drawLine("No approvals recorded yet.", { size: 11, color: [0.44, 0.5, 0.58] });
  }
  for (const approval of data.approvals) {
    pdf.ensureSpace(16);
    pdf.drawLine(
      `${approval.userName} (${approval.companyName}, ${approval.role}) — ${approval.approvedAt.slice(0, 10)}`,
      { size: 10, gap: 4 },
    );
  }

  return pdf.save();
}
