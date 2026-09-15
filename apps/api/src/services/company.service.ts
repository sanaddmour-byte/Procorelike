import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema, withRequestContext, type Database } from "@siteops/db";
import type { CreateCompanyInput, UploadCompanyLogoInput } from "@siteops/shared";
import { ApiError, NotFoundError } from "../lib/errors";

type CompanyRow = typeof schema.companies.$inferSelect;
export type CompanyListItem = Omit<CompanyRow, "logoDataBase64"> & { hasLogo: boolean };

/** Every list/detail response strips the (potentially ~1.4MB) base64 logo blob -- only `GET /companies/:id/logo` returns the actual bytes. `hasLogo` is all a list view needs to decide whether to render a preview. */
function stripLogoData(company: CompanyRow): CompanyListItem {
  const { logoDataBase64, ...rest } = company;
  return { ...rest, hasLogo: Boolean(logoDataBase64) };
}

export async function createCompany(
  appDb: Database,
  creatorUserId: string,
  input: CreateCompanyInput,
): Promise<CompanyListItem> {
  return withRequestContext(appDb, { userId: creatorUserId }, async (tx) => {
    // The id is generated here rather than left to the column default so
    // the insert can skip `.returning()`: under FORCE ROW LEVEL SECURITY,
    // RETURNING re-checks the new row against companies_visible_select,
    // which the creator doesn't satisfy yet -- the linking user_companies
    // row below is what grants that visibility, and it can't exist before
    // the company row does. Re-select once that link is in place instead.
    const id = randomUUID();
    await tx.insert(schema.companies).values({ ...input, id });
    await tx.insert(schema.userCompanies).values({ userId: creatorUserId, companyId: id });

    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1);
    if (!company) throw new Error("Failed to create company");
    return stripLogoData(company);
  });
}

/** RLS scopes this to companies the caller belongs to or shares a project with. */
export async function listMyCompanies(appDb: Database, userId: string): Promise<CompanyListItem[]> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const rows = await tx.select().from(schema.companies);
    return rows.map(stripLogoData);
  });
}

/**
 * PNG logo for branded PDF letterheads (Phase 12). RLS's
 * `companies_member_update` policy already restricts the UPDATE to actual
 * `user_companies` members (stricter than the SELECT policy, which also
 * admits anyone sharing a project with the company) -- a 0-row result
 * despite the company existing means "visible but not a member", not
 * "not found".
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function uploadCompanyLogo(
  appDb: Database,
  userId: string,
  companyId: string,
  input: UploadCompanyLogoInput,
): Promise<CompanyListItem> {
  // A payload that merely claims image/png but isn't a real PNG can make pdf-lib's decoder
  // hang indefinitely at report-generation time (observed directly while testing letterhead
  // rendering) -- reject it here, once, up front, rather than at every PDF export.
  const bytes = Buffer.from(input.dataBase64, "base64");
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new ApiError(400, "invalid_png", "The uploaded file is not a valid PNG image");
  }

  return withRequestContext(appDb, { userId }, async (tx) => {
    const [existing] = await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
    if (!existing) throw new NotFoundError("Company not found");

    const [updated] = await tx
      .update(schema.companies)
      .set({ logoDataBase64: input.dataBase64, logoMime: input.mime, updatedAt: new Date(), serverRevision: existing.serverRevision + 1 })
      .where(eq(schema.companies.id, companyId))
      .returning();
    if (!updated) throw new ApiError(403, "not_company_member", "You are not a member of this company");
    return stripLogoData(updated);
  });
}

export interface CompanyLogo {
  mime: string;
  dataBase64: string;
}

/** Branding isn't sensitive -- any authenticated caller who can see the company (RLS's is_company_visible: a member, or shares a project with it) can fetch its logo, so a PDF can render a collaborating company's letterhead without membership friction. */
export async function getCompanyLogo(appDb: Database, userId: string, companyId: string): Promise<CompanyLogo | null> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
    if (!company || !company.logoDataBase64 || !company.logoMime) return null;
    return { mime: company.logoMime, dataBase64: company.logoDataBase64 };
  });
}
