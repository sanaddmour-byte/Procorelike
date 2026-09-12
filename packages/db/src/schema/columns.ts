import { bigint, boolean, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";

/** Standard primary key for every table. */
export function idColumn() {
  return uuid("id").primaryKey().defaultRandom();
}

/** Soft-delete + sync/concurrency columns shared by every business entity. */
export function auditColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverRevision: bigint("server_revision", { mode: "number" }).notNull().default(1),
  };
}

/**
 * Offline-sync conflict columns for tables the mobile outbox can push
 * edits to (docs/ARCHITECTURE.md §6). `needsReview` surfaces the record in
 * a resolution screen; `conflictData` holds the field-level {base, server,
 * client} triples from `mergeFields` (@siteops/shared) so no data is
 * silently discarded even while a conflict is unresolved.
 */
export function syncColumns() {
  return {
    needsReview: boolean("needs_review").notNull().default(false),
    conflictData: jsonb("conflict_data"),
  };
}
