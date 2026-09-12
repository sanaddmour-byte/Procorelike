import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  requirePermission,
  type CreateDrawingInput,
  type CreateDrawingRevisionInput,
  type CreateMarkupInput,
  type PermissionContext,
  type UpdateDrawingInput,
} from "@siteops/shared";
import { desc, eq } from "drizzle-orm";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type DrawingRow = typeof schema.drawings.$inferSelect;
type DrawingRevisionRow = typeof schema.drawingRevisions.$inferSelect;
type MarkupRow = typeof schema.markups.$inferSelect;

export async function createDrawing(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateDrawingInput,
): Promise<DrawingRow> {
  requirePermission(ctx, "drawings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [drawing] = await tx.insert(schema.drawings).values({ ...input, createdBy: userId }).returning();
    if (!drawing) throw new Error("Failed to create drawing");
    await writeAuditLog(tx, { actorId: userId, entityType: "drawing", entityId: drawing.id, action: "create", after: drawing });
    return drawing;
  });
}

export async function listDrawings(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<DrawingRow[]> {
  requirePermission(ctx, "drawings", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.drawings).where(eq(schema.drawings.projectId, projectId));
  });
}

/** Peek used by routes to resolve which project a drawing belongs to before loading the full permission context — see permission.service.ts's withUserContext doc comment. */
export async function findDrawingById(appDb: Database, userId: string, drawingId: string): Promise<DrawingRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [drawing] = await tx.select().from(schema.drawings).where(eq(schema.drawings.id, drawingId)).limit(1);
    return drawing;
  });
}

export async function getDrawing(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  drawingId: string,
): Promise<DrawingRow | undefined> {
  requirePermission(ctx, "drawings", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [drawing] = await tx.select().from(schema.drawings).where(eq(schema.drawings.id, drawingId)).limit(1);
    return drawing;
  });
}

export async function updateDrawing(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  drawingId: string,
  input: UpdateDrawingInput,
): Promise<DrawingRow | undefined> {
  requirePermission(ctx, "drawings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.drawings).where(eq(schema.drawings.id, drawingId)).limit(1);
    if (!existing) return undefined;

    const [updated] = await tx
      .update(schema.drawings)
      .set({
        sheetNumber: input.sheetNumber ?? existing.sheetNumber,
        discipline: input.discipline ?? existing.discipline,
        title: input.title ?? existing.title,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.drawings.id, drawingId))
      .returning();
    return updated;
  });
}

/** Peek used by the markups route to resolve which project a revision (and its drawing) belongs to before loading the full permission context. */
export async function findDrawingRevisionById(
  appDb: Database,
  userId: string,
  revisionId: string,
): Promise<(DrawingRevisionRow & { projectId: string }) | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx
      .select({ revision: schema.drawingRevisions, projectId: schema.drawings.projectId })
      .from(schema.drawingRevisions)
      .innerJoin(schema.drawings, eq(schema.drawingRevisions.drawingId, schema.drawings.id))
      .where(eq(schema.drawingRevisions.id, revisionId))
      .limit(1);
    return row ? { ...row.revision, projectId: row.projectId } : undefined;
  });
}

/**
 * The Phase 3 gate scenario: uploading a new revision never deletes or
 * overwrites the old one. The previously-current revision is stamped
 * `supersededAt` (retained, still fully queryable via the history list)
 * and the drawing register row's `currentRevisionId` pointer moves to the
 * new revision — an atomic pointer swap, not a destructive replace.
 */
export async function createDrawingRevision(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  drawingId: string,
  input: CreateDrawingRevisionInput,
): Promise<DrawingRevisionRow> {
  requirePermission(ctx, "drawings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [drawing] = await tx.select().from(schema.drawings).where(eq(schema.drawings.id, drawingId)).limit(1);
    if (!drawing) throw new Error("Drawing not found");

    if (drawing.currentRevisionId) {
      await tx
        .update(schema.drawingRevisions)
        .set({ supersededAt: new Date() })
        .where(eq(schema.drawingRevisions.id, drawing.currentRevisionId));
    }

    const [revision] = await tx
      .insert(schema.drawingRevisions)
      .values({
        drawingId,
        revisionCode: input.revisionCode,
        attachmentId: input.attachmentId,
        issuedDate: new Date(input.issuedDate),
        createdBy: userId,
      })
      .returning();
    if (!revision) throw new Error("Failed to create drawing revision");

    await tx
      .update(schema.drawings)
      .set({ currentRevisionId: revision.id, updatedAt: new Date(), serverRevision: drawing.serverRevision + 1 })
      .where(eq(schema.drawings.id, drawingId));

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "drawing_revision",
      entityId: revision.id,
      action: "create",
      after: revision,
    });
    return revision;
  });
}

export async function listDrawingRevisions(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  drawingId: string,
): Promise<DrawingRevisionRow[]> {
  requirePermission(ctx, "drawings", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx
      .select()
      .from(schema.drawingRevisions)
      .where(eq(schema.drawingRevisions.drawingId, drawingId))
      .orderBy(desc(schema.drawingRevisions.issuedDate), desc(schema.drawingRevisions.createdAt));
  });
}

export async function createMarkup(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  drawingRevisionId: string,
  input: CreateMarkupInput,
): Promise<MarkupRow> {
  requirePermission(ctx, "drawings", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [markup] = await tx
      .insert(schema.markups)
      .values({ drawingRevisionId, createdBy: userId, coords: input.coords, note: input.note })
      .returning();
    if (!markup) throw new Error("Failed to create markup");
    await writeAuditLog(tx, { actorId: userId, entityType: "markup", entityId: markup.id, action: "create", after: markup });
    return markup;
  });
}

export async function listMarkups(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  drawingRevisionId: string,
): Promise<MarkupRow[]> {
  requirePermission(ctx, "drawings", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.markups).where(eq(schema.markups.drawingRevisionId, drawingRevisionId));
  });
}
