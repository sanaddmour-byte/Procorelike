import { schema, withRequestContext, type Database } from "@siteops/db";
import type { CreateCompanyInput } from "@siteops/shared";

export async function createCompany(
  appDb: Database,
  creatorUserId: string,
  input: CreateCompanyInput,
): Promise<typeof schema.companies.$inferSelect> {
  return withRequestContext(appDb, { userId: creatorUserId }, async (tx) => {
    const [company] = await tx.insert(schema.companies).values(input).returning();
    if (!company) throw new Error("Failed to create company");
    await tx.insert(schema.userCompanies).values({ userId: creatorUserId, companyId: company.id });
    return company;
  });
}

/** RLS scopes this to companies the caller belongs to or shares a project with. */
export async function listMyCompanies(
  appDb: Database,
  userId: string,
): Promise<(typeof schema.companies.$inferSelect)[]> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    return tx.select().from(schema.companies);
  });
}
