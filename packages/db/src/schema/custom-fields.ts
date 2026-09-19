import { boolean, integer, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn } from "./columns";
import { permissionModuleEnum, projects } from "./core";

export const customFieldTypeEnum = pgEnum("custom_field_type", ["text", "number", "date", "boolean", "select"]);

/**
 * Admin-defined extra fields per project + module (Procore's "custom
 * fields" concept). `options` only applies to fieldType "select" — a
 * JSON array of string choices, validated in packages/shared rather than
 * with a DB-level constraint since the shape depends on fieldType.
 */
export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  module: permissionModuleEnum("module").notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  fieldType: customFieldTypeEnum("field_type").notNull(),
  options: jsonb("options").$type<string[] | null>(),
  required: boolean("required").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per (definition, entity). `entityId` is polymorphic — whatever
 * record in `definition.module` the value belongs to — resolved by the
 * caller, the same "app layer knows the type" pattern record_links and
 * the audit log already use for polymorphic references.
 */
export const customFieldValues = pgTable(
  "custom_field_values",
  {
    id: idColumn(),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => customFieldDefinitions.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").notNull(),
    /** Always a JSON-encoded scalar matching definition.fieldType — string, number, boolean, or ISO date string. */
    value: jsonb("value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("custom_field_values_definition_entity_idx").on(table.definitionId, table.entityId)],
);
