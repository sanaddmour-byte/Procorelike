import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type CreatePdfCommentInput, type Module, type PdfCommentRecordType, type PermissionContext } from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors";

type PdfCommentRow = typeof schema.pdfComments.$inferSelect;

/** Which permission module a pinned PDF comment's recordType belongs to -- same "app-layer, no RLS" approach as record-links.service.ts's LINK_TYPE_MODULES, for the same reason (the underlying record varies by type). */
const RECORD_TYPE_MODULES: Record<PdfCommentRecordType, Module> = {
  rfi: "rfis",
  submittal: "submittals",
  change_order: "change_management",
  correspondence: "correspondence",
  inspection: "inspections",
};

export async function createPdfComment(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreatePdfCommentInput,
): Promise<PdfCommentRow> {
  requirePermission(ctx, RECORD_TYPE_MODULES[input.recordType], "standard");
  if (input.linkedRfiId) requirePermission(ctx, "rfis", "read");

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.pdfComments)
      .values({
        projectId: input.projectId,
        recordType: input.recordType,
        recordId: input.recordId,
        pageNumber: input.pageNumber,
        x: input.x,
        y: input.y,
        commentText: input.commentText,
        linkedRfiId: input.linkedRfiId,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create PDF comment");
    return row;
  });
}

export async function listPdfComments(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  recordType: PdfCommentRecordType,
  recordId: string,
): Promise<PdfCommentRow[]> {
  requirePermission(ctx, RECORD_TYPE_MODULES[recordType], "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx
      .select()
      .from(schema.pdfComments)
      .where(and(eq(schema.pdfComments.recordType, recordType), eq(schema.pdfComments.recordId, recordId)));
  });
}

/** Every comment (on any record's PDF) that refers to this RFI -- the reciprocal side of a comment's optional linkedRfiId, shown on the RFI detail page. */
export async function listPdfCommentsLinkedToRfi(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  rfiId: string,
): Promise<PdfCommentRow[]> {
  requirePermission(ctx, "rfis", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.pdfComments).where(eq(schema.pdfComments.linkedRfiId, rfiId));
  });
}

/** Sets or clears which RFI an existing comment refers to -- requires "standard" on the comment's own module (the same level required to post it) and, when setting a link, "read" on rfis. */
export async function setPdfCommentRfiLink(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  commentId: string,
  linkedRfiId: string | null,
): Promise<PdfCommentRow> {
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.pdfComments).where(eq(schema.pdfComments.id, commentId)).limit(1);
    if (!existing) throw new NotFoundError("PDF comment not found");
    requirePermission(ctx, RECORD_TYPE_MODULES[existing.recordType as PdfCommentRecordType], "standard");
    if (linkedRfiId) requirePermission(ctx, "rfis", "read");

    const [updated] = await tx.update(schema.pdfComments).set({ linkedRfiId }).where(eq(schema.pdfComments.id, commentId)).returning();
    if (!updated) throw new Error("Failed to update PDF comment");
    return updated;
  });
}

