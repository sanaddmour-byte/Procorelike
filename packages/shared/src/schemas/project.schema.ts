import { z } from "zod";
import { LOCALES } from "../constants/locales";
import { PROJECT_ROLES } from "../constants/roles";

export const createProjectSchema = z
  .object({
    name: z.string().min(1).max(200),
    address: z.string().max(500).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    localeDefault: z.enum(LOCALES).default("en"),
    timezone: z.string().min(1).max(100).default("Asia/Amman"),
  })
  .strict();
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const assignProjectUserSchema = z
  .object({
    userId: z.string().uuid(),
    companyId: z.string().uuid(),
    role: z.enum(PROJECT_ROLES),
    permissionTemplateId: z.string().uuid().optional(),
  })
  .strict();
export type AssignProjectUserInput = z.infer<typeof assignProjectUserSchema>;

/**
 * The general project-settings panel — previously these fields (defaultCurrency,
 * changeOrderThreshold) had no update path at all past project creation.
 * `timezone` is included since it's the same class of simple scalar setting;
 * `name`/`address`/`localeDefault` are deliberately left out of this first
 * pass (renaming a project has wider implications — search indexing, PDF
 * headers already generated — worth its own review rather than folding in here).
 */
export const updateProjectSettingsSchema = z
  .object({
    defaultCurrency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, "Expected an ISO 4217 currency code, e.g. USD")
      .optional(),
    changeOrderThreshold: z.number().min(0).optional(),
    timezone: z.string().min(1).max(100).optional(),
  })
  .strict();
export type UpdateProjectSettingsInput = z.infer<typeof updateProjectSettingsSchema>;
