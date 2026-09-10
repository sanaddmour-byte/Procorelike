import { bigint, timestamp, uuid } from "drizzle-orm/pg-core";

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
