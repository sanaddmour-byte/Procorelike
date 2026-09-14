import type { ChangeOrderListReportData } from "../services/change-management.service";
import { PdfBuilder, type TableColumn } from "./pdf-builder";

const COLUMNS: TableColumn[] = [
  { header: "Number", width: 55 },
  { header: "Title", width: 100 },
  { header: "Target", width: 75 },
  { header: "Status", width: 75 },
  { header: "Cost impact", width: 110 },
  { header: "Time impact", width: 80 },
];

export async function generateChangeOrderListPdf(data: ChangeOrderListReportData): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create();
  await pdf.drawLetterhead(data.companyName, data.logoPngBytes);

  pdf.drawLine("Change Order Register", { size: 20, bold: true, gap: 10 });
  pdf.drawLine(`Project: ${data.projectName}`, { size: 12, gap: 4 });
  pdf.drawLine(
    `Generated: ${new Date().toISOString().slice(0, 10)} — ${data.rows.length} change order${data.rows.length === 1 ? "" : "s"}`,
    { size: 9, color: [0.44, 0.5, 0.58], gap: 14 },
  );

  if (data.rows.length === 0) {
    pdf.drawLine("No change orders on this project yet.", { size: 11, color: [0.44, 0.5, 0.58] });
    return pdf.save();
  }

  pdf.drawTable(
    COLUMNS,
    data.rows.map((r) => [
      r.number,
      r.title ?? "—",
      r.targetType === "prime" ? "Prime contract" : "Commitment",
      `${r.status}${r.executed ? " (Executed)" : ""}`,
      `$${Number(r.costImpact).toLocaleString()}`,
      `${r.timeImpactDays} days`,
    ]),
  );

  return pdf.save();
}
