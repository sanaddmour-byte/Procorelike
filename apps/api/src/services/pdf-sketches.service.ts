import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type CreatePdfSketchInput, type PdfCommentRecordType, type PermissionContext } from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import { PDF_RECORD_TYPE_MODULES } from "./pdf-record-types";

type PdfSketchRow = typeof schema.pdfSketches.$inferSelect;

export async function createPdfSketch(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreatePdfSketchInput,
): Promise<PdfSketchRow> {
  requirePermission(ctx, PDF_RECORD_TYPE_MODULES[input.recordType], "standard");

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.pdfSketches)
      .values({
        projectId: input.projectId,
        recordType: input.recordType,
        recordId: input.recordId,
        pageNumber: input.pageNumber,
        points: input.points,
        color: input.color,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create PDF sketch");
    return row;
  });
}

export async function listPdfSketches(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  recordType: PdfCommentRecordType,
  recordId: string,
): Promise<PdfSketchRow[]> {
  requirePermission(ctx, PDF_RECORD_TYPE_MODULES[recordType], "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx
      .select()
      .from(schema.pdfSketches)
      .where(and(eq(schema.pdfSketches.recordType, recordType), eq(schema.pdfSketches.recordId, recordId)));
  });
}
