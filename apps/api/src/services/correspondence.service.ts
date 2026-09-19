import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  CORRESPONDENCE_STATUS_TRANSITIONS,
  DEFAULT_PAGE_SIZE,
  formatCorrespondenceNumber,
  requirePermission,
  type CorrespondenceDirection,
  type CorrespondenceSortKey,
  type CorrespondenceStatus,
  type CorrespondenceType,
  type CreateCorrespondenceInput,
  type EsignatureVerification,
  type ListCorrespondenceQuery,
  type PaginatedResult,
  type PermissionContext,
  type TransitionCorrespondenceStatusInput,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { getCompanyBranding, resolveAuthorCompanyBranding, type ReportBranding } from "../lib/report-branding";
import { getLatestSignature, recordSignature, verifySignature } from "./esignature.service";
import { withUserContext } from "./permission.service";

type CorrespondenceRow = typeof schema.correspondence.$inferSelect;

/** The exact content an e-signature on a "sent" correspondence certifies -- everything that would matter if this letter were later disputed, frozen at send time. */
function signedContentSnapshot(row: CorrespondenceRow): unknown {
  return {
    correspondenceNumber: row.correspondenceNumber,
    direction: row.direction,
    type: row.type,
    subject: row.subject,
    body: row.body,
    fromCompanyId: row.fromCompanyId,
    toCompanyId: row.toCompanyId,
  };
}

export async function createCorrespondence(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateCorrespondenceInput,
): Promise<CorrespondenceRow> {
  requirePermission(ctx, "correspondence", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const seq = await nextSequenceNumber(tx, input.projectId, "COR");
    const [row] = await tx
      .insert(schema.correspondence)
      .values({
        projectId: input.projectId,
        correspondenceNumber: formatCorrespondenceNumber(seq),
        direction: input.direction,
        type: input.type,
        subject: input.subject,
        body: input.body,
        fromCompanyId: input.fromCompanyId,
        toCompanyId: input.toCompanyId,
        responseRequiredBy: input.responseRequiredBy ? new Date(input.responseRequiredBy) : undefined,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create correspondence");

    await writeAuditLog(tx, { actorId: userId, entityType: "correspondence", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project a correspondence item belongs to before loading the full permission context. */
export async function findCorrespondenceById(
  appDb: Database,
  userId: string,
  correspondenceId: string,
): Promise<CorrespondenceRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.correspondence).where(eq(schema.correspondence.id, correspondenceId)).limit(1);
    return row;
  });
}

const CORRESPONDENCE_SORT_COLUMNS: Record<
  CorrespondenceSortKey,
  typeof schema.correspondence.correspondenceNumber | typeof schema.correspondence.subject | typeof schema.correspondence.type | typeof schema.correspondence.status
> = {
  correspondenceNumber: schema.correspondence.correspondenceNumber,
  subject: schema.correspondence.subject,
  type: schema.correspondence.type,
  status: schema.correspondence.status,
};

export async function listCorrespondence(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListCorrespondenceQuery = {},
): Promise<PaginatedResult<CorrespondenceRow>> {
  requirePermission(ctx, "correspondence", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.correspondence.projectId, projectId)];

    if (query.status) conditions.push(eq(schema.correspondence.status, query.status));
    if (query.search) {
      conditions.push(or(ilike(schema.correspondence.subject, `%${query.search}%`), ilike(schema.correspondence.correspondenceNumber, `%${query.search}%`))!);
    }
    const where = and(...conditions)!;

    const sortColumn = CORRESPONDENCE_SORT_COLUMNS[query.sort ?? "correspondenceNumber"];
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.correspondence).where(where).orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.correspondence).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function transitionCorrespondenceStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  correspondenceId: string,
  input: TransitionCorrespondenceStatusInput,
): Promise<CorrespondenceRow> {
  requirePermission(ctx, "correspondence", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.correspondence).where(eq(schema.correspondence.id, correspondenceId)).limit(1);
    if (!existing) throw new NotFoundError("Correspondence not found");

    const allowed = CORRESPONDENCE_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(
        409,
        "invalid_status_transition",
        `Cannot move correspondence from '${existing.status}' to '${input.toStatus}'`,
      );
    }

    const [updated] = await tx
      .update(schema.correspondence)
      .set({
        status: input.toStatus,
        sentDate: input.toStatus === "sent" ? new Date() : existing.sentDate,
        senderSignatureName: input.toStatus === "sent" ? input.senderSignatureName : existing.senderSignatureName,
        acknowledgedBy: input.toStatus === "acknowledged" ? userId : existing.acknowledgedBy,
        acknowledgedAt: input.toStatus === "acknowledged" ? new Date() : existing.acknowledgedAt,
        closedBy: input.toStatus === "closed" ? userId : existing.closedBy,
        closedAt: input.toStatus === "closed" ? new Date() : existing.closedAt,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(schema.correspondence.id, correspondenceId))
      .returning();
    if (!updated) throw new Error("Failed to transition correspondence");

    if (input.toStatus === "sent") {
      await recordSignature(tx, {
        projectId: updated.projectId,
        documentType: "correspondence",
        documentId: updated.id,
        signerUserId: userId,
        signerName: input.senderSignatureName ?? "",
        signatureImageBase64: input.signatureImageBase64,
        content: signedContentSnapshot(updated),
      });
    }

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "correspondence",
      entityId: correspondenceId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

/** Recomputes the content hash from the correspondence's current row and compares it to what its most recent e-signature certified -- the actual verification, not just a display of stored metadata. */
export async function getCorrespondenceSignature(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  correspondenceId: string,
): Promise<EsignatureVerification> {
  requirePermission(ctx, "correspondence", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.select().from(schema.correspondence).where(eq(schema.correspondence.id, correspondenceId)).limit(1);
    if (!row) throw new NotFoundError("Correspondence not found");

    const signature = await getLatestSignature(tx, "correspondence", correspondenceId);
    return verifySignature(signature, signedContentSnapshot(row));
  });
}

export interface CorrespondenceReportData extends ReportBranding {
  projectName: string;
  correspondenceNumber: string;
  direction: CorrespondenceDirection;
  type: CorrespondenceType;
  subject: string;
  body: string;
  fromCompanyName: string;
  toCompanyName: string;
  status: CorrespondenceStatus;
  sentDate: Date | null;
  responseRequiredBy: Date | null;
  senderSignatureName: string | null;
}

/** Assembles everything the PDF letter needs, mirroring inspection.service.ts's getInspectionReportData pattern. Branding is the *sending* company's own logo -- `fromCompanyId` is already a direct column here, unlike RFI/Submittal/Change Order, which have no such column and resolve the author's company via project_users instead. */
export async function getCorrespondenceReportData(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  correspondenceId: string,
): Promise<CorrespondenceReportData> {
  requirePermission(ctx, "correspondence", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx.select().from(schema.correspondence).where(eq(schema.correspondence.id, correspondenceId)).limit(1);
    if (!row) throw new NotFoundError("Correspondence not found");

    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, row.projectId)).limit(1);
    const [fromCompany] = await tx.select().from(schema.companies).where(eq(schema.companies.id, row.fromCompanyId)).limit(1);
    const [toCompany] = await tx.select().from(schema.companies).where(eq(schema.companies.id, row.toCompanyId)).limit(1);
    const branding = await getCompanyBranding(tx, row.fromCompanyId);

    return {
      ...branding,
      projectName: project?.name ?? "",
      correspondenceNumber: row.correspondenceNumber,
      direction: row.direction,
      type: row.type,
      subject: row.subject,
      body: row.body,
      fromCompanyName: fromCompany?.name ?? "Unknown",
      toCompanyName: toCompany?.name ?? "Unknown",
      status: row.status,
      sentDate: row.sentDate,
      responseRequiredBy: row.responseRequiredBy,
      senderSignatureName: row.senderSignatureName,
    };
  });
}

export interface CorrespondenceListRow {
  correspondenceNumber: string;
  subject: string;
  fromCompanyName: string;
  toCompanyName: string;
  status: CorrespondenceStatus;
  sentDate: Date | null;
}

export interface CorrespondenceListReportData extends ReportBranding {
  projectName: string;
  rows: CorrespondenceListRow[];
}

/** "Export all" register for the project's correspondence (Phase 13), branded with the requesting user's own company rather than each item's from-company (a register spans many senders). */
export async function getCorrespondenceListReportData(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<CorrespondenceListReportData> {
  requirePermission(ctx, "correspondence", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
    const rows = await tx
      .select()
      .from(schema.correspondence)
      .where(eq(schema.correspondence.projectId, projectId))
      .orderBy(schema.correspondence.correspondenceNumber);

    const companyIds = [...new Set(rows.flatMap((r) => [r.fromCompanyId, r.toCompanyId]))];
    const companies = companyIds.length > 0 ? await tx.select().from(schema.companies).where(inArray(schema.companies.id, companyIds)) : [];
    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));

    const branding = await resolveAuthorCompanyBranding(tx, projectId, userId);

    return {
      ...branding,
      projectName: project?.name ?? "",
      rows: rows.map((r) => ({
        correspondenceNumber: r.correspondenceNumber,
        subject: r.subject,
        fromCompanyName: companyNameById.get(r.fromCompanyId) ?? "Unknown",
        toCompanyName: companyNameById.get(r.toCompanyId) ?? "Unknown",
        status: r.status,
        sentDate: r.sentDate,
      })),
    };
  });
}
