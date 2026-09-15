import { schema, withRequestContext, type Database } from "@siteops/db";
import { attachRollups } from "./budget.service";
import { requirePermission, type PermissionContext } from "@siteops/shared";
import { eq } from "drizzle-orm";

/** Escapes a field for RFC 4180 CSV: quotes it if it contains a comma, quote, or newline, doubling any embedded quotes. */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(values: (string | number)[]): string {
  return values.map(csvField).join(",");
}

/**
 * Budget CSV export -- the closest honest equivalent to a real ERP sync
 * (docs decision: no fake live QuickBooks/Sage connection). Gated at
 * "admin" on the budget module since exporting cost data wholesale is a
 * more sensitive operation than viewing it on-screen.
 */
export async function exportBudgetCsv(appDb: Database, userId: string, ctx: PermissionContext, projectId: string): Promise<string> {
  requirePermission(ctx, "budget", "admin");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const lineItems = await tx.select().from(schema.budgetLineItems).where(eq(schema.budgetLineItems.projectId, projectId));
    const costCodes = await tx.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId));
    const codeById = new Map(costCodes.map((c) => [c.id, c]));
    const withRollups = await attachRollups(tx, projectId, lineItems);

    const header = csvRow([
      "Cost Code",
      "Description",
      "Original Amount",
      "Modifications",
      "Approved Changes",
      "Committed Costs",
      "Direct Costs",
      "Revised Budget",
      "Projected",
      "Variance",
    ]);
    const rows = withRollups.map((li) => {
      const cc = codeById.get(li.costCodeId);
      const revised = Number(li.originalAmount) + Number(li.modificationsAmount) + Number(li.approvedChangesAmount);
      return csvRow([
        cc?.code ?? li.costCodeId,
        cc?.description ?? "",
        li.originalAmount,
        li.modificationsAmount,
        li.approvedChangesAmount,
        Number(li.committedCosts).toFixed(2),
        Number(li.directCosts).toFixed(2),
        revised.toFixed(2),
        li.projectedAmount,
        (revised - Number(li.projectedAmount)).toFixed(2),
      ]);
    });
    return [header, ...rows].join("\r\n") + "\r\n";
  });
}

function iifDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/**
 * Commitments IIF (Intuit Interchange Format) export -- one Purchase
 * Order transaction per commitment, split by its line items' cost codes.
 * QuickBooks Desktop imports this directly (File > Utilities > Import >
 * IIF Files). This is a minimal, valid subset of the format, not a
 * full accounting integration: no account-mapping configuration, no
 * two-way sync.
 */
export async function exportCommitmentsIif(appDb: Database, userId: string, ctx: PermissionContext, projectId: string): Promise<string> {
  requirePermission(ctx, "commitments", "admin");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const commitments = await tx.select().from(schema.commitments).where(eq(schema.commitments.projectId, projectId));
    const costCodes = await tx.select().from(schema.costCodes).where(eq(schema.costCodes.projectId, projectId));
    const companies = await tx.select().from(schema.companies);
    const codeById = new Map(costCodes.map((c) => [c.id, c]));
    const companyById = new Map(companies.map((c) => [c.id, c]));

    const lines = [
      "!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO",
      "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO",
      "!ENDTRNS",
    ];

    for (const commitment of commitments) {
      const lineItems = await tx
        .select()
        .from(schema.commitmentLineItems)
        .where(eq(schema.commitmentLineItems.commitmentId, commitment.id));
      const total = lineItems.reduce((sum, li) => sum + Number(li.scheduleOfValuesAmount), 0);
      const vendor = companyById.get(commitment.companyId)?.name ?? commitment.companyId;
      const date = iifDate(commitment.createdAt);
      const memo = `${commitment.number} - ${commitment.title}`;

      lines.push(["TRNS", "", "PURCHORD", date, "Accounts Payable", vendor, (-total).toFixed(2), memo].join("\t"));
      for (const li of lineItems) {
        const cc = codeById.get(li.costCodeId);
        const account = `Job Costs:${cc?.code ?? li.costCodeId}`;
        lines.push(["SPL", "", "PURCHORD", date, account, vendor, Number(li.scheduleOfValuesAmount).toFixed(2), li.description].join("\t"));
      }
      lines.push("ENDTRNS");
    }

    return lines.join("\r\n") + "\r\n";
  });
}
