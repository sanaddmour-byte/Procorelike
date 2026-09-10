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
