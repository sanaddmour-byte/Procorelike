import { z } from "zod";
import { MODULES } from "../constants/modules";
import { PERMISSION_LEVELS } from "../constants/permission-levels";

export const permissionOverrideSchema = z
  .object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    module: z.enum(MODULES),
    level: z.enum(PERMISSION_LEVELS),
  })
  .strict();
export type PermissionOverrideInput = z.infer<typeof permissionOverrideSchema>;

export const permissionTemplateSchema = z
  .object({
    name: z.string().min(1).max(200),
    levels: z.record(z.enum(MODULES), z.enum(PERMISSION_LEVELS)),
  })
  .strict();
export type PermissionTemplateInput = z.infer<typeof permissionTemplateSchema>;
