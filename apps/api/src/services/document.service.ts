import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  DEFAULT_PAGE_SIZE,
  requirePermission,
  type CreateDocumentFolderInput,
  type CreateDocumentInput,
  type ListDocumentsQuery,
  type PaginatedResult,
  type PermissionContext,
  type UpdateDocumentInput,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type DocumentFolderRow = typeof schema.documentFolders.$inferSelect;
type DocumentRow = typeof schema.documents.$inferSelect;

export async function createDocumentFolder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateDocumentFolderInput,
): Promise<DocumentFolderRow> {
  requirePermission(ctx, "documents", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [folder] = await tx.insert(schema.documentFolders).values(input).returning();
    if (!folder) throw new Error("Failed to create document folder");
    return folder;
  });
}

export async function listDocumentFolders(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<DocumentFolderRow[]> {
  requirePermission(ctx, "documents", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.documentFolders).where(eq(schema.documentFolders.projectId, projectId));
  });
}

/** Peek used by routes to resolve which project a document belongs to before loading the full permission context — see permission.service.ts's withUserContext doc comment for why this can't be a raw appDb query. */
export async function findDocumentById(appDb: Database, userId: string, documentId: string): Promise<DocumentRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [document] = await tx.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
    return document;
  });
}

export async function createDocument(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateDocumentInput,
): Promise<DocumentRow> {
  requirePermission(ctx, "documents", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [document] = await tx
      .insert(schema.documents)
      .values({
        projectId: input.projectId,
        folderId: input.folderId,
        title: input.title,
        currentAttachmentId: input.attachmentId,
        createdBy: userId,
      })
      .returning();
    if (!document) throw new Error("Failed to create document");

    await writeAuditLog(tx, { actorId: userId, entityType: "document", entityId: document.id, action: "create", after: document });
    return document;
  });
}

export async function listDocuments(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  folderId: string | null,
  query: ListDocumentsQuery = {},
): Promise<PaginatedResult<DocumentRow>> {
  requirePermission(ctx, "documents", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [
      eq(schema.documents.projectId, projectId),
      folderId ? eq(schema.documents.folderId, folderId) : isNull(schema.documents.folderId),
    ];
    if (query.search) conditions.push(ilike(schema.documents.title, `%${query.search}%`));
    const where = and(...conditions)!;

    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.documents).where(where).orderBy(orderFn(schema.documents.title));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.documents).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function getDocument(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  documentId: string,
): Promise<DocumentRow | undefined> {
  requirePermission(ctx, "documents", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [document] = await tx.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
    return document;
  });
}

/** Renaming, moving, or replacing a document's file overwrites in place — see docs/DATA_MODEL.md §2: unlike drawings, documents have no revision history. */
export async function updateDocument(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  documentId: string,
  input: UpdateDocumentInput,
): Promise<DocumentRow | undefined> {
  requirePermission(ctx, "documents", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
    if (!existing) return undefined;

    const [updated] = await tx
      .update(schema.documents)
      .set({
        folderId: input.folderId === undefined ? existing.folderId : input.folderId,
        title: input.title ?? existing.title,
        currentAttachmentId: input.attachmentId ?? existing.currentAttachmentId,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.documents.id, documentId))
      .returning();
    if (!updated) return undefined;

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "document",
      entityId: documentId,
      action: "update",
      before: existing,
      after: updated,
    });
    return updated;
  });
}
