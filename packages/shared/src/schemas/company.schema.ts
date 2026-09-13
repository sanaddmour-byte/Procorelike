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

/**
 * PNG-only logo for branded PDF letterheads (Phase 12) -- stored inline as
 * base64 (see packages/db's companies.logoDataBase64 comment), not through
 * the project-scoped attachments/S3 pipeline. The ~1.4MB base64 cap keeps a
 * logo a logo, not a general image upload.
 */
export const uploadCompanyLogoSchema = z
  .object({
    mime: z.literal("image/png"),
    dataBase64: z.string().min(1).max(1_900_000),
  })
  .strict();
export type UploadCompanyLogoInput = z.infer<typeof uploadCompanyLogoSchema>;
