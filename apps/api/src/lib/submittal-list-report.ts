import type { SubmittalListReportData } from "../services/submittal.service";
import { PdfBuilder, type TableColumn } from "./pdf-builder";

const COLUMNS: TableColumn[] = [
  { header: "Number", width: 55 },
  { header: "Title", width: 190 },
  { header: "Status", width: 70 },
  { header: "Ball in court", width: 120 },
  { header: "Req. on site", width: 60 },
];

export async function generateSubmittalListPdf(data: SubmittalListReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();
  await pdf.drawLetterhead(data.companyName, data.logoPngBytes);

  pdf.drawLine("Submittal Register", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`Project: ${data.projectName}`, { size: 12, gap: 4 });
  pdf.drawLine(
    `Generated: ${new Date().toISOString().slice(0, 10)} — ${data.rows.length} submittal${data.rows.length === 1 ? "" : "s"}`,
    { size: 9, color: [0.44, 0.5, 0.58], gap: 14 },
  );

  if (data.rows.length === 0) {
    pdf.drawLine("No submittals on this project yet.", { size: 11, color: [0.44, 0.5, 0.58] });
    return pdf.save();
  }

  pdf.drawTable(
    COLUMNS,
    data.rows.map((r) => [
      r.number,
      r.title,
      r.status,
      r.ballInCourtName ?? "Unassigned",
      r.requiredOnSiteDate ? r.requiredOnSiteDate.toISOString().slice(0, 10) : "—",
    ]),
  );

  return pdf.save();
}
