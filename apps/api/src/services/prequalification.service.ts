import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  DEFAULT_PAGE_SIZE,
  PREQUALIFICATION_STATUS_TRANSITIONS,
  requirePermission,
  type InvitePrequalificationInput,
  type ListPrequalificationsQuery,
  type PaginatedResult,
  type PermissionContext,
  type PrequalificationSortKey,
  type SubmitPrequalificationInput,
  type TransitionPrequalificationStatusInput,
} from "@siteops/shared";
import { and, asc, count, desc, eq, getTableColumns, ilike } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type PrequalificationRow = typeof schema.prequalifications.$inferSelect;

export async function invitePrequalification(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: InvitePrequalificationInput,
): Promise<PrequalificationRow> {
  requirePermission(ctx, "prequalification", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    try {
      const [row] = await tx
        .insert(schema.prequalifications)
        .values({ projectId: input.projectId, companyId: input.companyId, createdBy: userId })
        .returning();
      if (!row) throw new Error("Failed to invite company to prequalify");

      await writeAuditLog(tx, { actorId: userId, entityType: "prequalification", entityId: row.id, action: "create", after: row });
      return row;
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        throw new ApiError(409, "already_invited", "This company already has a prequalification record on this project");
      }
      throw err;
    }
  });
}

/** Peek used by routes to resolve which project a prequalification belongs to before loading the full permission context. */
export async function findPrequalificationById(
  appDb: Database,
  userId: string,
  prequalificationId: string,
): Promise<PrequalificationRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.prequalifications).where(eq(schema.prequalifications.id, prequalificationId)).limit(1);
    return row;
  });
}

export async function listPrequalifications(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListPrequalificationsQuery = {},
): Promise<PaginatedResult<PrequalificationRow>> {
  requirePermission(ctx, "prequalification", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.prequalifications.projectId, projectId)];

    if (query.status) conditions.push(eq(schema.prequalifications.status, query.status));
    if (query.search) conditions.push(ilike(schema.companies.name, `%${query.search}%`));
    const where = and(...conditions)!;

    const sortKey: PrequalificationSortKey = query.sort ?? "company";
    const sortColumn =
      sortKey === "status"
        ? schema.prequalifications.status
        : sortKey === "overallScore"
          ? schema.prequalifications.overallScore
          : schema.companies.name;
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx
      .select(getTableColumns(schema.prequalifications))
      .from(schema.prequalifications)
      .innerJoin(schema.companies, eq(schema.prequalifications.companyId, schema.companies.id))
      .where(where)
      .orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx
        .select({ value: count() })
        .from(schema.prequalifications)
        .innerJoin(schema.companies, eq(schema.prequalifications.companyId, schema.companies.id))
        .where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function submitPrequalification(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  prequalificationId: string,
  input: SubmitPrequalificationInput,
): Promise<PrequalificationRow> {
  requirePermission(ctx, "prequalification", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.prequalifications).where(eq(schema.prequalifications.id, prequalificationId)).limit(1);
    if (!existing) throw new NotFoundError("Prequalification not found");
    if (existing.status !== "invited") {
      throw new ApiError(409, "invalid_status_transition", "Can only submit a prequalification that is still 'invited'");
    }

    const [updated] = await tx
      .update(schema.prequalifications)
      .set({
        status: "submitted",
        bondingCapacity: input.bondingCapacity?.toString(),
        experienceModRate: input.experienceModRate?.toString(),
        annualRevenue: input.annualRevenue?.toString(),
        yearsInBusiness: input.yearsInBusiness?.toString(),
        referencesText: input.referencesText,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.prequalifications.id, prequalificationId))
      .returning();
    if (!updated) throw new Error("Failed to submit prequalification");
    return updated;
  });
}

export async function transitionPrequalificationStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  prequalificationId: string,
  input: TransitionPrequalificationStatusInput,
): Promise<PrequalificationRow> {
  requirePermission(ctx, "prequalification", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.prequalifications).where(eq(schema.prequalifications.id, prequalificationId)).limit(1);
    if (!existing) throw new NotFoundError("Prequalification not found");

    const allowed = PREQUALIFICATION_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(
        409,
        "invalid_status_transition",
        `Cannot move a prequalification from '${existing.status}' to '${input.toStatus}'`,
      );
    }

    const isReviewDecision = input.toStatus === "qualified" || input.toStatus === "disqualified";
    const [updated] = await tx
      .update(schema.prequalifications)
      .set({
        status: input.toStatus,
        overallScore: isReviewDecision ? input.overallScore?.toString() : existing.overallScore,
        reviewNotes: isReviewDecision ? input.reviewNotes : existing.reviewNotes,
        reviewedBy: isReviewDecision ? userId : existing.reviewedBy,
        reviewedAt: isReviewDecision ? new Date() : existing.reviewedAt,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: existing.serverRevision + 1,
      })
      .where(eq(schema.prequalifications.id, prequalificationId))
      .returning();
    if (!updated) throw new Error("Failed to transition prequalification");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "prequalification",
      entityId: prequalificationId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
