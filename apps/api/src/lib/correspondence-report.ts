import type { CorrespondenceReportData } from "../services/correspondence.service";
import { PdfBuilder } from "./pdf-builder";

const TYPE_LABEL: Record<string, string> = { letter: "Letter", notice: "Notice", transmittal: "Transmittal", memo: "Memo" };

export async function generateCorrespondencePdf(data: CorrespondenceReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();
  await pdf.drawLetterhead(data.companyName, data.logoPngBytes);

  pdf.drawLine(TYPE_LABEL[data.type] ?? data.type, { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`${data.correspondenceNumber} — ${data.subject}`, { size: 14, gap: 12 });

  pdf.drawLine(`Project: ${data.projectName}`);
  pdf.drawLine(`From: ${data.fromCompanyName}`);
  pdf.drawLine(`To: ${data.toCompanyName}`);
  pdf.drawLine(`Status: ${data.status}`);
  if (data.responseRequiredBy) pdf.drawLine(`Response required by: ${data.responseRequiredBy.toISOString().slice(0, 10)}`);
  pdf.addSpacer(10);

  for (const line of data.body.split("\n")) pdf.drawLine(line, { size: 11, gap: 4 });
  pdf.addSpacer(20);

  pdf.ensureSpace(60);
  pdf.drawLine("Signature", { size: 13, bold: true, gap: 8 });
  if (data.senderSignatureName) {
    pdf.drawLine(data.senderSignatureName, { size: 14, bold: true, gap: 2 });
    pdf.drawUnderline();
    if (data.sentDate) pdf.drawLine(`Sent ${data.sentDate.toISOString().slice(0, 10)}`, { size: 9, color: [0.44, 0.5, 0.58] });
  } else {
    pdf.drawLine("Not yet sent/signed", { size: 11, color: [0.6, 0.2, 0.2] });
  }

  return pdf.save();
}
