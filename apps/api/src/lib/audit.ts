import { schema, type Tx } from "@siteops/db";

export interface AuditEntry {
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  correlationId?: string | null;
}

/** Every mutation writes an immutable audit_log row inside the same transaction as the mutation itself (Rule 6 / docs/DATA_MODEL.md §1). */
export async function writeAuditLog(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(schema.auditLog).values({
    actorId: entry.actorId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
    correlationId: entry.correlationId ?? null,
  });
}
