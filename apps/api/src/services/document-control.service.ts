import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  formatTransmittalNumber,
  requirePermission,
  type CreateDrawingSetInput,
  type CreateTransmittalInput,
  type PermissionContext,
} from "@siteops/shared";
import { eq, inArray } from "drizzle-orm";
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

export async function listTransmittals(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<TransmittalRow[]> {
  requirePermission(ctx, "documents", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.transmittals).where(eq(schema.transmittals.projectId, projectId));
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
