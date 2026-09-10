import { z } from "zod";

export const companyTypeSchema = z.enum(["gc", "sub", "consultant", "owner"]);
export type CompanyType = z.infer<typeof companyTypeSchema>;

export const createCompanySchema = z
  .object({
    name: z.string().min(1).max(200),
    type: companyTypeSchema,
  })
  .strict();
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
