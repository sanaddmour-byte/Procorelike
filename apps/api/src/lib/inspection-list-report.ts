import type { InspectionListReportData } from "../services/inspection.service";
import { PdfBuilder, type TableColumn } from "./pdf-builder";

const COLUMNS: TableColumn[] = [
  { header: "Template", width: 140 },
  { header: "Location", width: 100 },
  { header: "Status", width: 65 },
  { header: "Performed by", width: 120 },
  { header: "Scheduled", width: 70 },
];

export async function generateInspectionListPdf(data: InspectionListReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();

  pdf.drawLine("Inspection Register", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`Project: ${data.projectName}`, { size: 12, gap: 4 });
  pdf.drawLine(
    `Generated: ${new Date().toISOString().slice(0, 10)} — ${data.rows.length} inspection${data.rows.length === 1 ? "" : "s"}`,
    { size: 9, color: [0.44, 0.5, 0.58], gap: 14 },
  );

  if (data.rows.length === 0) {
    pdf.drawLine("No inspections on this project yet.", { size: 11, color: [0.44, 0.5, 0.58] });
    return pdf.save();
  }

  pdf.drawTable(
    COLUMNS,
    data.rows.map((r) => [
      r.templateTitle,
      r.locationName ?? "—",
      r.status,
      r.performedByName ?? "Unassigned",
      r.scheduledAt ? r.scheduledAt.toISOString().slice(0, 10) : "—",
    ]),
  );

  return pdf.save();
}
