import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  DEFAULT_PAGE_SIZE,
  formatTransmittalNumber,
  requirePermission,
  type CreateDrawingSetInput,
  type CreateTransmittalInput,
  type ListTransmittalsQuery,
  type PaginatedResult,
  type PermissionContext,
  type TransmittalSortKey,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type TransmittalRow = typeof schema.transmittals.$inferSelect;
type TransmittalItemRow = typeof schema.transmittalItems.$inferSelect;
type TransmittalRecipientRow = typeof schema.transmittalRecipients.$inferSelect;

export interface TransmittalWithDetails extends TransmittalRow {
  items: TransmittalItemRow[];
  recipients: TransmittalRecipientRow[];
}

/** Procore's Transmittals: a numbered cover record bundling a set of documents/drawing revisions/drawing sets, sent to a distribution list with a stated purpose (for review, for approval, etc.) and per-recipient acknowledgment tracking -- distinct from Correspondence's free-form "transmittal" type, which has no items or distribution of its own. */
export async function createTransmittal(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateTransmittalInput,
): Promise<TransmittalWithDetails> {
  requirePermission(ctx, "documents", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const seq = await nextSequenceNumber(tx, input.projectId, "TR");
    const [row] = await tx
      .insert(schema.transmittals)
      .values({
        projectId: input.projectId,
        transmittalNumber: formatTransmittalNumber(seq),
        subject: input.subject,
        purpose: input.purpose,
        message: input.message,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create transmittal");

    const items = await tx
      .insert(schema.transmittalItems)
      .values(input.items.map((item) => ({ transmittalId: row.id, ...item })))
      .returning();
    const recipients = await tx
      .insert(schema.transmittalRecipients)
      .values(input.recipients.map((r) => ({ transmittalId: row.id, userId: r.userId, companyId: r.companyId })))
      .returning();

    await writeAuditLog(tx, { actorId: userId, entityType: "transmittal", entityId: row.id, action: "create", after: row });
    return { ...row, items, recipients };
  });
}

export async function findTransmittalById(appDb: Database, userId: string, transmittalId: string): Promise<TransmittalRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.transmittals).where(eq(schema.transmittals.id, transmittalId)).limit(1);
    return row;
  });
}

const TRANSMITTAL_SORT_COLUMNS: Record<
  TransmittalSortKey,
  | typeof schema.transmittals.transmittalNumber
  | typeof schema.transmittals.subject
  | typeof schema.transmittals.purpose
  | typeof schema.transmittals.status
> = {
  transmittalNumber: schema.transmittals.transmittalNumber,
  subject: schema.transmittals.subject,
  purpose: schema.transmittals.purpose,
  status: schema.transmittals.status,
};

export async function listTransmittals(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListTransmittalsQuery = {},
): Promise<PaginatedResult<TransmittalRow>> {
  requirePermission(ctx, "documents", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.transmittals.projectId, projectId)];

    if (query.status) conditions.push(eq(schema.transmittals.status, query.status));
    if (query.search) {
      conditions.push(
        or(ilike(schema.transmittals.subject, `%${query.search}%`), ilike(schema.transmittals.transmittalNumber, `%${query.search}%`))!,
      );
    }
    const where = and(...conditions)!;

    const sortColumn = TRANSMITTAL_SORT_COLUMNS[query.sort ?? "transmittalNumber"];
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.transmittals).where(where).orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.transmittals).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function getTransmittal(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  transmittalId: string,
): Promise<TransmittalWithDetails> {
  requirePermission(ctx, "documents", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.select().from(schema.transmittals).where(eq(schema.transmittals.id, transmittalId)).limit(1);
    if (!row) throw new NotFoundError("Transmittal not found");
    const items = await tx.select().from(schema.transmittalItems).where(eq(schema.transmittalItems.transmittalId, transmittalId));
    const recipients = await tx
      .select()
      .from(schema.transmittalRecipients)
      .where(eq(schema.transmittalRecipients.transmittalId, transmittalId));
    return { ...row, items, recipients };
  });
}

export async function sendTransmittal(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  transmittalId: string,
): Promise<TransmittalRow> {
  requirePermission(ctx, "documents", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.transmittals).where(eq(schema.transmittals.id, transmittalId)).limit(1);
    if (!existing) throw new NotFoundError("Transmittal not found");
    if (existing.status !== "draft") {
      throw new ApiError(409, "invalid_status_transition", "Only a draft transmittal can be sent");
    }
    const [updated] = await tx
      .update(schema.transmittals)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.transmittals.id, transmittalId))
      .returning();
    if (!updated) throw new Error("Failed to send transmittal");
    await writeAuditLog(tx, { actorId: userId, entityType: "transmittal", entityId: transmittalId, action: "send", after: updated });
    return updated;
  });
}

/** The current user acknowledges receipt of a sent transmittal they were personally named on (company-only recipients have no individual "I received this" action). */
export async function acknowledgeTransmittal(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  transmittalId: string,
): Promise<TransmittalRecipientRow> {
  requirePermission(ctx, "documents", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [recipient] = await tx
      .select()
      .from(schema.transmittalRecipients)
      .where(eq(schema.transmittalRecipients.transmittalId, transmittalId))
      .then((rows) => rows.filter((r) => r.userId === userId));
    if (!recipient) throw new NotFoundError("You are not a named recipient of this transmittal");
    const [updated] = await tx
      .update(schema.transmittalRecipients)
      .set({ acknowledgedAt: new Date() })
      .where(eq(schema.transmittalRecipients.id, recipient.id))
      .returning();
    if (!updated) throw new Error("Failed to acknowledge transmittal");
    return updated;
  });
}

type DrawingSetRow = typeof schema.drawingSets.$inferSelect;

export interface DrawingSetWithItems extends DrawingSetRow {
  drawingRevisionIds: string[];
}

/** Procore's Drawing Sets: publishing many sheet revisions together as one named, dated bundle (e.g. "Issued for Construction, Set 3") rather than superseding sheets one at a time. */
export async function createDrawingSet(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateDrawingSetInput,
): Promise<DrawingSetWithItems> {
  requirePermission(ctx, "drawings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.drawingSets)
      .values({ projectId: input.projectId, name: input.name, publishedDate: new Date(input.publishedDate), createdBy: userId })
      .returning();
    if (!row) throw new Error("Failed to create drawing set");

    await tx.insert(schema.drawingSetItems).values(input.drawingRevisionIds.map((drawingRevisionId) => ({ drawingSetId: row.id, drawingRevisionId })));

    await writeAuditLog(tx, { actorId: userId, entityType: "drawing_set", entityId: row.id, action: "create", after: row });
    return { ...row, drawingRevisionIds: input.drawingRevisionIds };
  });
}

export async function listDrawingSets(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<DrawingSetWithItems[]> {
  requirePermission(ctx, "drawings", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const sets = await tx.select().from(schema.drawingSets).where(eq(schema.drawingSets.projectId, projectId));
    if (sets.length === 0) return [];

    const items = await tx
      .select()
      .from(schema.drawingSetItems)
      .where(
        inArray(
          schema.drawingSetItems.drawingSetId,
          sets.map((s) => s.id),
        ),
      );
    const revisionIdsBySet = new Map<string, string[]>();
    for (const item of items) {
      const bucket = revisionIdsBySet.get(item.drawingSetId) ?? [];
      bucket.push(item.drawingRevisionId);
      revisionIdsBySet.set(item.drawingSetId, bucket);
    }
    return sets.map((s) => ({ ...s, drawingRevisionIds: revisionIdsBySet.get(s.id) ?? [] }));
  });
}

export async function getDrawingSet(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  drawingSetId: string,
): Promise<DrawingSetWithItems> {
  requirePermission(ctx, "drawings", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.select().from(schema.drawingSets).where(eq(schema.drawingSets.id, drawingSetId)).limit(1);
    if (!row) throw new NotFoundError("Drawing set not found");
    const items = await tx.select().from(schema.drawingSetItems).where(eq(schema.drawingSetItems.drawingSetId, drawingSetId));
    return { ...row, drawingRevisionIds: items.map((i) => i.drawingRevisionId) };
  });
}

export async function findDrawingSetById(appDb: Database, userId: string, drawingSetId: string): Promise<DrawingSetRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.drawingSets).where(eq(schema.drawingSets.id, drawingSetId)).limit(1);
    return row;
  });
}
