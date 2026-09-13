import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  formatRfiNumber,
  requirePermission,
  RFI_STATUS_TRANSITIONS,
  type CreateRfiInput,
  type CreateRfiResponseInput,
  type PermissionContext,
  type RfiStatus,
  type TransitionRfiStatusInput,
  type UpdateRfiInput,
} from "@siteops/shared";
import { desc, eq, inArray } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { resolveAuthorCompanyBranding, type ReportBranding } from "../lib/report-branding";
import { withUserContext } from "./permission.service";

type RfiRow = typeof schema.rfis.$inferSelect;
type RfiResponseRow = typeof schema.rfiResponses.$inferSelect;
type RfiDistributionRow = typeof schema.rfiDistribution.$inferSelect;

export interface RfiWithOverdue extends RfiRow {
  isOverdue: boolean;
}

export interface RfiDetail extends RfiWithOverdue {
  responses: RfiResponseRow[];
  distribution: RfiDistributionRow[];
}

/** `is_open_and_past_due`, not stored — always derived fresh so it can never drift from the current clock (docs/DATA_MODEL.md §3). */
function withOverdue(rfi: RfiRow): RfiWithOverdue {
  const isOverdue = rfi.status === "open" && rfi.dueDate !== null && rfi.dueDate.getTime() < Date.now();
  return { ...rfi, isOverdue };
}

export async function createRfi(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateRfiInput,
): Promise<RfiWithOverdue> {
  requirePermission(ctx, "rfis", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const seq = await nextSequenceNumber(tx, input.projectId, "RFI");
    const [rfi] = await tx
      .insert(schema.rfis)
      .values({
        projectId: input.projectId,
        number: formatRfiNumber(seq),
        subject: input.subject,
        question: input.question,
        ballInCourtUserId: input.ballInCourtUserId,
        ballInCourtCompanyId: input.ballInCourtCompanyId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        costImpactFlag: input.costImpactFlag,
        scheduleImpactFlag: input.scheduleImpactFlag,
        createdBy: userId,
      })
      .returning();
    if (!rfi) throw new Error("Failed to create RFI");

    const distributionRows = [
      ...input.distributionUserIds.map((distUserId) => ({ rfiId: rfi.id, userId: distUserId })),
      ...input.distributionCompanyIds.map((companyId) => ({ rfiId: rfi.id, companyId })),
    ];
    if (distributionRows.length > 0) {
      await tx.insert(schema.rfiDistribution).values(distributionRows);
    }

    await writeAuditLog(tx, { actorId: userId, entityType: "rfi", entityId: rfi.id, action: "create", after: rfi });
    return withOverdue(rfi);
  });
}

/** Peek used by routes to resolve which project an RFI belongs to before loading the full permission context — see permission.service.ts's withUserContext doc comment. */
export async function findRfiById(appDb: Database, userId: string, rfiId: string): Promise<RfiRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [rfi] = await tx.select().from(schema.rfis).where(eq(schema.rfis.id, rfiId)).limit(1);
    return rfi;
  });
}

export async function listRfis(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<RfiWithOverdue[]> {
  requirePermission(ctx, "rfis", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx.select().from(schema.rfis).where(eq(schema.rfis.projectId, projectId));
    return rows.map(withOverdue);
  });
}

export async function getRfi(appDb: Database, userId: string, ctx: PermissionContext, rfiId: string): Promise<RfiDetail | undefined> {
  requirePermission(ctx, "rfis", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [rfi] = await tx.select().from(schema.rfis).where(eq(schema.rfis.id, rfiId)).limit(1);
    if (!rfi) return undefined;

    const [responses, distribution] = await Promise.all([
      tx.select().from(schema.rfiResponses).where(eq(schema.rfiResponses.rfiId, rfiId)).orderBy(desc(schema.rfiResponses.createdAt)),
      tx.select().from(schema.rfiDistribution).where(eq(schema.rfiDistribution.rfiId, rfiId)),
    ]);

    return { ...withOverdue(rfi), responses, distribution };
  });
}

export async function updateRfi(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  rfiId: string,
  input: UpdateRfiInput,
): Promise<RfiWithOverdue | undefined> {
  requirePermission(ctx, "rfis", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.rfis).where(eq(schema.rfis.id, rfiId)).limit(1);
    if (!existing) return undefined;

    const [updated] = await tx
      .update(schema.rfis)
      .set({
        subject: input.subject ?? existing.subject,
        question: input.question ?? existing.question,
        ballInCourtUserId: input.ballInCourtUserId ?? existing.ballInCourtUserId,
        ballInCourtCompanyId: input.ballInCourtCompanyId ?? existing.ballInCourtCompanyId,
        dueDate: input.dueDate ? new Date(input.dueDate) : existing.dueDate,
        costImpactFlag: input.costImpactFlag ?? existing.costImpactFlag,
        scheduleImpactFlag: input.scheduleImpactFlag ?? existing.scheduleImpactFlag,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.rfis.id, rfiId))
      .returning();
    return updated ? withOverdue(updated) : undefined;
  });
}

/**
 * Recording a response is separate from the RFI's own state — see
 * docs/DATA_MODEL.md §3: multiple responses are allowed, with one marked
 * official (the answer the RFI reflects). Marking a response official
 * unmarks any previous one and auto-transitions the RFI to "answered" with
 * the ball flipped back to whoever asked the question, in the same
 * transaction so the two can't drift apart.
 */
export async function addRfiResponse(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  rfiId: string,
  input: CreateRfiResponseInput,
): Promise<RfiResponseRow> {
  requirePermission(ctx, "rfis", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [rfi] = await tx.select().from(schema.rfis).where(eq(schema.rfis.id, rfiId)).limit(1);
    if (!rfi) throw new ApiError(404, "not_found", "RFI not found");
    if (rfi.status === "closed") throw new ApiError(400, "validation_error", "Cannot respond to a closed RFI");

    const [response] = await tx
      .insert(schema.rfiResponses)
      .values({ rfiId, respondedBy: userId, responseText: input.responseText, isOfficial: input.isOfficial })
      .returning();
    if (!response) throw new Error("Failed to create RFI response");

    if (input.isOfficial) {
      await tx
        .update(schema.rfiResponses)
        .set({ isOfficial: false })
        .where(eq(schema.rfiResponses.rfiId, rfiId));
      await tx.update(schema.rfiResponses).set({ isOfficial: true }).where(eq(schema.rfiResponses.id, response.id));

      await tx
        .update(schema.rfis)
        .set({
          status: "answered",
          ballInCourtUserId: rfi.createdBy,
          ballInCourtCompanyId: null,
          escalatedAt: null,
          updatedBy: userId,
          updatedAt: new Date(),
          serverRevision: rfi.serverRevision + 1,
        })
        .where(eq(schema.rfis.id, rfiId));
    }

    await writeAuditLog(tx, { actorId: userId, entityType: "rfi_response", entityId: response.id, action: "create", after: response });
    return { ...response, isOfficial: input.isOfficial };
  });
}

export async function transitionRfiStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  rfiId: string,
  input: TransitionRfiStatusInput,
): Promise<RfiWithOverdue> {
  requirePermission(ctx, "rfis", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [rfi] = await tx.select().from(schema.rfis).where(eq(schema.rfis.id, rfiId)).limit(1);
    if (!rfi) throw new ApiError(404, "not_found", "RFI not found");

    const allowed: readonly RfiStatus[] = RFI_STATUS_TRANSITIONS[rfi.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(400, "invalid_transition", `Cannot move RFI from '${rfi.status}' to '${input.toStatus}'`);
    }

    const [updated] = await tx
      .update(schema.rfis)
      .set({
        status: input.toStatus,
        escalatedAt: input.toStatus === "open" ? null : rfi.escalatedAt,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: rfi.serverRevision + 1,
      })
      .where(eq(schema.rfis.id, rfiId))
      .returning();
    if (!updated) throw new Error("Failed to transition RFI status");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "rfi",
      entityId: rfiId,
      action: "transition",
      before: { status: rfi.status },
      after: { status: updated.status },
    });
    return withOverdue(updated);
  });
}

export interface RfiReportResponse {
  respondedByName: string;
  responseText: string;
  isOfficial: boolean;
  createdAt: Date;
}

export interface RfiReportData extends ReportBranding {
  projectName: string;
  number: string;
  subject: string;
  question: string;
  status: RfiStatus;
  isOverdue: boolean;
  ballInCourtName: string | null;
  ballInCourtCompanyName: string | null;
  dueDate: Date | null;
  costImpactFlag: boolean;
  scheduleImpactFlag: boolean;
  responses: RfiReportResponse[];
}

/** Assembles everything the PDF report needs, mirroring inspection.service.ts's getInspectionReportData pattern -- one place that resolves every foreign key into a human-readable name. */
export async function getRfiReportData(appDb: Database, userId: string, ctx: PermissionContext, rfiId: string): Promise<RfiReportData> {
  requirePermission(ctx, "rfis", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [rfi] = await tx.select().from(schema.rfis).where(eq(schema.rfis.id, rfiId)).limit(1);
    if (!rfi) throw new NotFoundError("RFI not found");

    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, rfi.projectId)).limit(1);
    const [ballInCourtUser] = rfi.ballInCourtUserId
      ? await tx.select().from(schema.users).where(eq(schema.users.id, rfi.ballInCourtUserId)).limit(1)
      : [undefined];
    const [ballInCourtCompany] = rfi.ballInCourtCompanyId
      ? await tx.select().from(schema.companies).where(eq(schema.companies.id, rfi.ballInCourtCompanyId)).limit(1)
      : [undefined];

    const responseRows = await tx
      .select()
      .from(schema.rfiResponses)
      .where(eq(schema.rfiResponses.rfiId, rfiId))
      .orderBy(schema.rfiResponses.createdAt);
    const responderIds = [...new Set(responseRows.map((r) => r.respondedBy))];
    const responders = responderIds.length > 0 ? await tx.select().from(schema.users).where(inArray(schema.users.id, responderIds)) : [];
    const responderNameById = new Map(responders.map((u) => [u.id, u.name]));

    const branding = await resolveAuthorCompanyBranding(tx, rfi.projectId, rfi.createdBy);

    return {
      ...branding,
      projectName: project?.name ?? "",
      number: rfi.number,
      subject: rfi.subject,
      question: rfi.question,
      status: rfi.status,
      isOverdue: withOverdue(rfi).isOverdue,
      ballInCourtName: ballInCourtUser?.name ?? null,
      ballInCourtCompanyName: ballInCourtCompany?.name ?? null,
      dueDate: rfi.dueDate,
      costImpactFlag: rfi.costImpactFlag,
      scheduleImpactFlag: rfi.scheduleImpactFlag,
      responses: responseRows.map((r) => ({
        respondedByName: responderNameById.get(r.respondedBy) ?? "Unknown",
        responseText: r.responseText,
        isOfficial: r.isOfficial,
        createdAt: r.createdAt,
      })),
    };
  });
}

export interface RfiListRow {
  number: string;
  subject: string;
  status: RfiStatus;
  ballInCourtName: string | null;
  dueDate: Date | null;
}

export interface RfiListReportData extends ReportBranding {
  projectName: string;
  rows: RfiListRow[];
}

/** "Export all" register for the project's RFIs (Phase 13) -- one row per RFI, branded with the requesting user's own company rather than each RFI's individual author (a single register spans many authors). */
export async function getRfiListReportData(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<RfiListReportData> {
  requirePermission(ctx, "rfis", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
    const rfis = await tx.select().from(schema.rfis).where(eq(schema.rfis.projectId, projectId)).orderBy(schema.rfis.number);

    const ballInCourtIds = [...new Set(rfis.map((r) => r.ballInCourtUserId).filter((id): id is string => id !== null))];
    const ballInCourtUsers = ballInCourtIds.length > 0 ? await tx.select().from(schema.users).where(inArray(schema.users.id, ballInCourtIds)) : [];
    const nameById = new Map(ballInCourtUsers.map((u) => [u.id, u.name]));

    const branding = await resolveAuthorCompanyBranding(tx, projectId, userId);

    return {
      ...branding,
      projectName: project?.name ?? "",
      rows: rfis.map((r) => ({
        number: r.number,
        subject: r.subject,
        status: r.status,
        ballInCourtName: r.ballInCourtUserId ? (nameById.get(r.ballInCourtUserId) ?? null) : null,
        dueDate: r.dueDate,
      })),
    };
  });
}
