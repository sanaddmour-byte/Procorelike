import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@siteops/db";

export interface ReportBranding {
  companyName: string | null;
  logoPngBytes: Uint8Array | null;
}

const EMPTY_BRANDING: ReportBranding = { companyName: null, logoPngBytes: null };

/** Shared by every Phase 12 report generator: resolves a company's name + PNG logo bytes for PdfBuilder.drawLetterhead(). Non-PNG logos (schema allows only PNG anyway, but defensive) fall back to no image. */
export async function getCompanyBranding(tx: Tx, companyId: string | null | undefined): Promise<ReportBranding> {
  if (!companyId) return EMPTY_BRANDING;
  const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
  if (!company) return EMPTY_BRANDING;
  const logoPngBytes = company.logoMime === "image/png" && company.logoDataBase64 ? Buffer.from(company.logoDataBase64, "base64") : null;
  return { companyName: company.name, logoPngBytes };
}

/** For record types (RFI, Submittal, Change Order) with no direct "author company" column: resolves the creator's company on this project via project_users, the same join lookahead.service.ts already uses for commitment company-matching. */
export async function resolveAuthorCompanyBranding(tx: Tx, projectId: string, createdByUserId: string): Promise<ReportBranding> {
  const [membership] = await tx
    .select()
    .from(schema.projectUsers)
    .where(and(eq(schema.projectUsers.projectId, projectId), eq(schema.projectUsers.userId, createdByUserId)))
    .limit(1);
  return getCompanyBranding(tx, membership?.companyId);
}
