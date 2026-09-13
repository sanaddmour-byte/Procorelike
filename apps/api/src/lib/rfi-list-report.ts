import type { RfiListReportData } from "../services/rfi.service";
import { PdfBuilder, type TableColumn } from "./pdf-builder";

const COLUMNS: TableColumn[] = [
  { header: "Number", width: 55 },
  { header: "Subject", width: 190 },
  { header: "Status", width: 65 },
  { header: "Ball in court", width: 120 },
  { header: "Due", width: 65 },
];

export async function generateRfiListPdf(data: RfiListReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();
  await pdf.drawLetterhead(data.companyName, data.logoPngBytes);

  pdf.drawLine("RFI Register", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`Project: ${data.projectName}`, { size: 12, gap: 4 });
  pdf.drawLine(`Generated: ${new Date().toISOString().slice(0, 10)} — ${data.rows.length} RFI${data.rows.length === 1 ? "" : "s"}`, {
    size: 9,
    color: [0.44, 0.5, 0.58],
    gap: 14,
  });

  if (data.rows.length === 0) {
    pdf.drawLine("No RFIs on this project yet.", { size: 11, color: [0.44, 0.5, 0.58] });
    return pdf.save();
  }

  pdf.drawTable(
    COLUMNS,
    data.rows.map((r) => [
      r.number,
      r.subject,
      r.status,
      r.ballInCourtName ?? "Unassigned",
      r.dueDate ? r.dueDate.toISOString().slice(0, 10) : "—",
    ]),
  );

  return pdf.save();
}
