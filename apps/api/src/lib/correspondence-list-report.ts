import type { CorrespondenceListReportData } from "../services/correspondence.service";
import { PdfBuilder, type TableColumn } from "./pdf-builder";

const COLUMNS: TableColumn[] = [
  { header: "Number", width: 55 },
  { header: "Subject", width: 170 },
  { header: "From -> To", width: 140 },
  { header: "Status", width: 65 },
  { header: "Sent", width: 65 },
];

export async function generateCorrespondenceListPdf(data: CorrespondenceListReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();
  await pdf.drawLetterhead(data.companyName, data.logoPngBytes);

  pdf.drawLine("Correspondence Register", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`Project: ${data.projectName}`, { size: 12, gap: 4 });
  pdf.drawLine(
    `Generated: ${new Date().toISOString().slice(0, 10)} — ${data.rows.length} item${data.rows.length === 1 ? "" : "s"}`,
    { size: 9, color: [0.44, 0.5, 0.58], gap: 14 },
  );

  if (data.rows.length === 0) {
    pdf.drawLine("No correspondence on this project yet.", { size: 11, color: [0.44, 0.5, 0.58] });
    return pdf.save();
  }

  pdf.drawTable(
    COLUMNS,
    data.rows.map((r) => [
      r.correspondenceNumber,
      r.subject,
      `${r.fromCompanyName} -> ${r.toCompanyName}`,
      r.status,
      r.sentDate ? r.sentDate.toISOString().slice(0, 10) : "—",
    ]),
  );

  return pdf.save();
}
