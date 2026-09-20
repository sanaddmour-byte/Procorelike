import { z } from "zod";
import { MODULES } from "../constants/modules";

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "boolean", "select"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const createCustomFieldDefinitionSchema = z
  .object({
    projectId: z.string().uuid(),
    module: z.enum(MODULES),
    label: z.string().min(1).max(200),
    fieldType: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().min(1)).min(1).max(50).optional(),
    required: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict()
  .refine((v) => v.fieldType !== "select" || (v.options && v.options.length > 0), {
    message: "options is required for fieldType \"select\"",
    path: ["options"],
  });
export type CreateCustomFieldDefinitionInput = z.infer<typeof createCustomFieldDefinitionSchema>;

export const updateCustomFieldDefinitionSchema = z
  .object({
    projectId: z.string().uuid(),
    label: z.string().min(1).max(200).optional(),
    options: z.array(z.string().min(1)).min(1).max(50).optional(),
    required: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type UpdateCustomFieldDefinitionInput = z.infer<typeof updateCustomFieldDefinitionSchema>;

export const deleteCustomFieldDefinitionSchema = z.object({ projectId: z.string().uuid() }).strict();
export type DeleteCustomFieldDefinitionInput = z.infer<typeof deleteCustomFieldDefinitionSchema>;

/** value is a JSON-encoded scalar matching the definition's fieldType, validated server-side against the live definition since the type isn't known statically here. definitionId/entityId are path params, not part of the body. */
export const setCustomFieldValueSchema = z
  .object({
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })
  .strict();
export type SetCustomFieldValueInput = z.infer<typeof setCustomFieldValueSchema>;

/**
 * Validates a single value against its definition's fieldType/options —
 * shared between the API write path and any future client-side form
 * validation, so the rule lives in one place.
 */
export function validateCustomFieldValue(
  fieldType: CustomFieldType,
  options: string[] | null | undefined,
  value: string | number | boolean | null,
): string | null {
  if (value === null) return null;
  switch (fieldType) {
    case "text":
      return typeof value === "string" ? null : "Expected a text value";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "Expected a number value";
    case "boolean":
      return typeof value === "boolean" ? null : "Expected a true/false value";
    case "date":
      return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? null : "Expected a valid date";
    case "select":
      return typeof value === "string" && (options ?? []).includes(value) ? null : "Value is not one of the allowed options";
  }
}
