import { schema, type Database, type Tx } from "@siteops/db";
import { requirePermission, type Module, type PermissionContext } from "@siteops/shared";
import { and, desc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";
import { withUserContext } from "./permission.service";

export const HISTORY_ENTITY_TYPES = ["rfi", "punch_item"] as const;
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

const MODULE_FOR_ENTITY_TYPE: Record<HistoryEntityType, Module> = {
  rfi: "rfis",
  punch_item: "punch_list",
};

export function isHistoryEntityType(value: string): value is HistoryEntityType {
  return (HISTORY_ENTITY_TYPES as readonly string[]).includes(value);
}

type AuditLogRow = typeof schema.auditLog.$inferSelect;

/** Confirms the entity exists in this project by reading it through its own RLS-protected table — a 0-row result (wrong project, or RLS hides it) is treated as not-found before audit_log is ever touched. */
async function entityExistsInProject(tx: Tx, entityType: HistoryEntityType, entityId: string, projectId: string): Promise<boolean> {
  switch (entityType) {
    case "rfi": {
      const [row] = await tx.select({ id: schema.rfis.id }).from(schema.rfis).where(and(eq(schema.rfis.id, entityId), eq(schema.rfis.projectId, projectId))).limit(1);
      return Boolean(row);
    }
    case "punch_item": {
      const [row] = await tx
        .select({ id: schema.punchItems.id })
        .from(schema.punchItems)
        .where(and(eq(schema.punchItems.id, entityId), eq(schema.punchItems.projectId, projectId)))
        .limit(1);
      return Boolean(row);
    }
  }
}

/**
 * audit_log has no project_id (it's polymorphic — see packages/db/src/sql/
 * 001_rls_and_functions.sql's comment on why RLS can't scope it directly).
 * Real authorization here comes from fetching the entity itself through its
 * own RLS-protected table first: if that row isn't visible to the caller
 * (wrong project, or RLS hides it), the read stops before ever touching
 * audit_log, exactly the same "resolve via the owning table" pattern
 * search.service.ts already uses for polymorphic project-scoping.
 */
export async function getEntityHistory(
  appDb: Database,
  callerUserId: string,
  ctx: PermissionContext,
  projectId: string,
  entityType: HistoryEntityType,
  entityId: string,
): Promise<AuditLogRow[]> {
  requirePermission(ctx, MODULE_FOR_ENTITY_TYPE[entityType], "read");

  return withUserContext(appDb, callerUserId, async (tx) => {
    const exists = await entityExistsInProject(tx, entityType, entityId, projectId);
    if (!exists) throw new NotFoundError("Record not found");

    return tx
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, entityType), eq(schema.auditLog.entityId, entityId)))
      .orderBy(desc(schema.auditLog.createdAt));
  });
}
