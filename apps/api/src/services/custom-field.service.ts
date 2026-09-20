import { schema, type Database } from "@siteops/db";
import {
  requirePermission,
  validateCustomFieldValue,
  type CreateCustomFieldDefinitionInput,
  type Module,
  type PermissionContext,
  type UpdateCustomFieldDefinitionInput,
} from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { withUserContext } from "./permission.service";

type CustomFieldDefinitionRow = typeof schema.customFieldDefinitions.$inferSelect;
type CustomFieldValueRow = typeof schema.customFieldValues.$inferSelect;

export async function listCustomFieldDefinitions(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
  module: Module,
): Promise<CustomFieldDefinitionRow[]> {
  requirePermission(ctx, module, "read");
  return withUserContext(appDb, callerUserId, async (tx) => {
    return tx
      .select()
      .from(schema.customFieldDefinitions)
      .where(and(eq(schema.customFieldDefinitions.projectId, projectId), eq(schema.customFieldDefinitions.module, module)))
      .orderBy(schema.customFieldDefinitions.sortOrder);
  });
}

/** directory:admin gates defining fields, same convention as permission templates and the Permissions screen — an admin manages every module's structure from one place. */
export async function createCustomFieldDefinition(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  input: CreateCustomFieldDefinitionInput,
): Promise<CustomFieldDefinitionRow> {
  requirePermission(ctx, "directory", "admin");
  return withUserContext(appDb, callerUserId, async (tx) => {
    const [created] = await tx
      .insert(schema.customFieldDefinitions)
      .values({
        projectId: input.projectId,
        module: input.module,
        label: input.label,
        fieldType: input.fieldType,
        options: input.options ?? null,
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    if (!created) throw new Error("Failed to create custom field definition");
    return created;
  });
}

export async function updateCustomFieldDefinition(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  definitionId: string,
  input: UpdateCustomFieldDefinitionInput,
): Promise<CustomFieldDefinitionRow> {
  requirePermission(ctx, "directory", "admin");
  return withUserContext(appDb, callerUserId, async (tx) => {
    const patch: Partial<Pick<CustomFieldDefinitionRow, "label" | "options" | "required" | "sortOrder" | "updatedAt">> = {
      updatedAt: new Date(),
    };
    if (input.label !== undefined) patch.label = input.label;
    if (input.options !== undefined) patch.options = input.options;
    if (input.required !== undefined) patch.required = input.required;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    const [updated] = await tx
      .update(schema.customFieldDefinitions)
      .set(patch)
      .where(eq(schema.customFieldDefinitions.id, definitionId))
      .returning();
    if (!updated) throw new NotFoundError("Custom field definition not found");
    return updated;
  });
}

export async function deleteCustomFieldDefinition(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  definitionId: string,
): Promise<void> {
  requirePermission(ctx, "directory", "admin");
  await withUserContext(appDb, callerUserId, async (tx) => {
    const deleted = await tx
      .delete(schema.customFieldDefinitions)
      .where(eq(schema.customFieldDefinitions.id, definitionId))
      .returning({ id: schema.customFieldDefinitions.id });
    if (deleted.length === 0) throw new NotFoundError("Custom field definition not found");
  });
}

/** Every value for one entity, joined with its definition so the caller gets label/fieldType without a second round trip. */
export async function listCustomFieldValuesForEntity(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
  module: Module,
  entityId: string,
): Promise<{ definition: CustomFieldDefinitionRow; value: CustomFieldValueRow | null }[]> {
  requirePermission(ctx, module, "read");
  return withUserContext(appDb, callerUserId, async (tx) => {
    const definitions = await tx
      .select()
      .from(schema.customFieldDefinitions)
      .where(and(eq(schema.customFieldDefinitions.projectId, projectId), eq(schema.customFieldDefinitions.module, module)))
      .orderBy(schema.customFieldDefinitions.sortOrder);
    if (definitions.length === 0) return [];

    const values = await tx.select().from(schema.customFieldValues).where(eq(schema.customFieldValues.entityId, entityId));
    const valueByDefinitionId = new Map(values.map((v) => [v.definitionId, v]));
    return definitions.map((definition) => ({ definition, value: valueByDefinitionId.get(definition.id) ?? null }));
  });
}

/** "standard" on the definition's module — whoever can edit the record can edit its custom fields, same level the record's own create/update requires. */
export async function setCustomFieldValue(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  definitionId: string,
  entityId: string,
  value: string | number | boolean | null,
): Promise<CustomFieldValueRow> {
  return withUserContext(appDb, callerUserId, async (tx) => {
    const [definition] = await tx.select().from(schema.customFieldDefinitions).where(eq(schema.customFieldDefinitions.id, definitionId)).limit(1);
    if (!definition) throw new NotFoundError("Custom field definition not found");
    requirePermission(ctx, definition.module, "standard");

    if (definition.required && value === null) {
      throw new ApiError(400, "validation_error", `${definition.label} is required`);
    }
    const error = validateCustomFieldValue(definition.fieldType, definition.options, value);
    if (error) throw new ApiError(400, "validation_error", error);

    const [existing] = await tx
      .select()
      .from(schema.customFieldValues)
      .where(and(eq(schema.customFieldValues.definitionId, definitionId), eq(schema.customFieldValues.entityId, entityId)))
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(schema.customFieldValues)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.customFieldValues.id, existing.id))
        .returning();
      if (!updated) throw new Error("Failed to update custom field value");
      return updated;
    }

    const [created] = await tx.insert(schema.customFieldValues).values({ definitionId, entityId, value }).returning();
    if (!created) throw new Error("Failed to create custom field value");
    return created;
  });
}
