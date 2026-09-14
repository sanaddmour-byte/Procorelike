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
    /** Gates the write: caller must be directory:admin on this project. Permission templates are global/reusable, not owned by the project. */
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200),
    levels: z.record(z.enum(MODULES), z.enum(PERMISSION_LEVELS)),
  })
  .strict();
export type PermissionTemplateInput = z.infer<typeof permissionTemplateSchema>;

export const updatePermissionTemplateSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    levels: z.record(z.enum(MODULES), z.enum(PERMISSION_LEVELS)).optional(),
  })
  .strict();
export type UpdatePermissionTemplateInput = z.infer<typeof updatePermissionTemplateSchema>;

export const deletePermissionTemplateSchema = z
  .object({
    projectId: z.string().uuid(),
  })
  .strict();
export type DeletePermissionTemplateInput = z.infer<typeof deletePermissionTemplateSchema>;

export const assignPermissionTemplateSchema = z
  .object({
    permissionTemplateId: z.string().uuid().nullable(),
  })
  .strict();
export type AssignPermissionTemplateInput = z.infer<typeof assignPermissionTemplateSchema>;

export const clearPermissionOverrideSchema = z
  .object({
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    module: z.enum(MODULES),
  })
  .strict();
export type ClearPermissionOverrideInput = z.infer<typeof clearPermissionOverrideSchema>;
