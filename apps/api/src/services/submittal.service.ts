import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  formatSubmittalNumber,
  PASSING_SUBMITTAL_RESPONSE_CODES,
  requirePermission,
  type CreateSubmittalInput,
  type CreateSubmittalRevisionInput,
  type PermissionContext,
  type SubmittalResponseCode,
  type SubmittalStatus,
  type SubmitSubmittalReviewInput,
} from "@siteops/shared";
import { and, asc, eq, inArray, max, or } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { resolveAuthorCompanyBranding, type ReportBranding } from "../lib/report-branding";
import { withUserContext } from "./permission.service";

type SubmittalRow = typeof schema.submittals.$inferSelect;
type SubmittalPackageRow = typeof schema.submittalPackages.$inferSelect;
type SubmittalRevisionRow = typeof schema.submittalRevisions.$inferSelect;
type SubmittalReviewRow = typeof schema.submittalReviews.$inferSelect;
type SubmittalDistributionRow = typeof schema.submittalDistribution.$inferSelect;

export interface PackageWithRevisions extends SubmittalPackageRow {
  revisions: (SubmittalRevisionRow & { reviews: SubmittalReviewRow[] })[];
}

export interface SubmittalDetail extends SubmittalRow {
  packages: PackageWithRevisions[];
  specSection: { id: string; csiCode: string; title: string } | null;
  distribution: SubmittalDistributionRow[];
}

export async function listSpecSections(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<(typeof schema.specificationsSections.$inferSelect)[]> {
  requirePermission(ctx, "submittals", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.specificationsSections).where(eq(schema.specificationsSections.projectId, projectId));
  });
}

export interface SpecSectionDetail {
  id: string;
  projectId: string;
  csiCode: string;
  title: string;
  submittals: { id: string; number: string; title: string; status: SubmittalStatus }[];
  linkedRfis: { id: string; number: string; subject: string; status: string }[];
}

/** Unauthenticated peek used by the route to resolve which project a spec section belongs to, before loading a real permission context. */
export async function findSpecSectionProjectId(appDb: Database, userId: string, specSectionId: string): Promise<string | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.specificationsSections).where(eq(schema.specificationsSections.id, specSectionId)).limit(1);
    return row?.projectId;
  });
}

/** A spec section's own page: its submittals (via the direct FK) plus anything explicitly linked to it (today, just RFIs -- see record-links.service.ts's LINK_TYPE_MODULES). */
export async function getSpecSectionDetail(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  specSectionId: string,
): Promise<SpecSectionDetail | undefined> {
  requirePermission(ctx, "submittals", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [section] = await tx.select().from(schema.specificationsSections).where(eq(schema.specificationsSections.id, specSectionId)).limit(1);
    if (!section) return undefined;

    const submittalRows = await tx.select().from(schema.submittals).where(eq(schema.submittals.specSectionId, specSectionId));

    const links = await tx
      .select()
      .from(schema.recordLinks)
      .where(
        or(
          and(eq(schema.recordLinks.targetType, "specification_section"), eq(schema.recordLinks.targetId, specSectionId)),
          and(eq(schema.recordLinks.sourceType, "specification_section"), eq(schema.recordLinks.sourceId, specSectionId)),
        ),
      );
    const rfiIds = links
      .map((l) => (l.sourceType === "rfi" ? l.sourceId : l.targetType === "rfi" ? l.targetId : null))
      .filter((id): id is string => Boolean(id));
    const rfiRows = rfiIds.length > 0 ? await tx.select().from(schema.rfis).where(inArray(schema.rfis.id, rfiIds)) : [];

    return {
      id: section.id,
      projectId: section.projectId,
      csiCode: section.csiCode,
      title: section.title,
      submittals: submittalRows.map((s) => ({ id: s.id, number: s.number, title: s.title, status: s.status })),
      linkedRfis: rfiRows.map((r) => ({ id: r.id, number: r.number, subject: r.subject, status: r.status })),
    };
  });
}

export async function createSubmittal(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateSubmittalInput,
): Promise<SubmittalRow> {
  requirePermission(ctx, "submittals", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [specSection] = await tx
      .select()
      .from(schema.specificationsSections)
      .where(eq(schema.specificationsSections.id, input.specSectionId))
      .limit(1);
    if (!specSection) throw new NotFoundError("Spec section not found");

    const seq = await nextSequenceNumber(tx, input.projectId, `SUB-${input.specSectionId}`);
    const [submittal] = await tx
      .insert(schema.submittals)
      .values({
        projectId: input.projectId,
        number: formatSubmittalNumber(specSection.csiCode, seq),
        specSectionId: input.specSectionId,
        title: input.title,
        leadTimeDays: input.leadTimeDays,
        requiredOnSiteDate: input.requiredOnSiteDate ? new Date(input.requiredOnSiteDate) : undefined,
        createdBy: userId,
      })
      .returning();
    if (!submittal) throw new Error("Failed to create submittal");

    const distributionRows = [
      ...input.distributionUserIds.map((distUserId) => ({ submittalId: submittal.id, userId: distUserId })),
      ...input.distributionCompanyIds.map((companyId) => ({ submittalId: submittal.id, companyId })),
    ];
    if (distributionRows.length > 0) {
      await tx.insert(schema.submittalDistribution).values(distributionRows);
    }

    await writeAuditLog(tx, { actorId: userId, entityType: "submittal", entityId: submittal.id, action: "create", after: submittal });
    return submittal;
  });
}

/** Peek used by routes to resolve which project a submittal belongs to before loading the full permission context. */
export async function findSubmittalById(appDb: Database, userId: string, submittalId: string): Promise<SubmittalRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [submittal] = await tx.select().from(schema.submittals).where(eq(schema.submittals.id, submittalId)).limit(1);
    return submittal;
  });
}

/** Peek used by the revision-create route to resolve a package's submittal/project before loading the full permission context. */
export async function findSubmittalByPackageId(
  appDb: Database,
  userId: string,
  packageId: string,
): Promise<SubmittalRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx
      .select({ submittal: schema.submittals })
      .from(schema.submittalPackages)
      .innerJoin(schema.submittals, eq(schema.submittalPackages.submittalId, schema.submittals.id))
      .where(eq(schema.submittalPackages.id, packageId))
      .limit(1);
    return row?.submittal;
  });
}

/** Peek used by the revision-review route to resolve a revision's submittal/project before loading the full permission context. */
export async function findSubmittalByRevisionId(
  appDb: Database,
  userId: string,
  revisionId: string,
): Promise<SubmittalRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx
      .select({ submittal: schema.submittals })
      .from(schema.submittalRevisions)
      .innerJoin(schema.submittalPackages, eq(schema.submittalRevisions.packageId, schema.submittalPackages.id))
      .innerJoin(schema.submittals, eq(schema.submittalPackages.submittalId, schema.submittals.id))
      .where(eq(schema.submittalRevisions.id, revisionId))
      .limit(1);
    return row?.submittal;
  });
}

export async function listSubmittals(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<SubmittalRow[]> {
  requirePermission(ctx, "submittals", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.submittals).where(eq(schema.submittals.projectId, projectId));
  });
}

export async function getSubmittal(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  submittalId: string,
): Promise<SubmittalDetail | undefined> {
  requirePermission(ctx, "submittals", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [submittal] = await tx.select().from(schema.submittals).where(eq(schema.submittals.id, submittalId)).limit(1);
    if (!submittal) return undefined;

    const [specSection] = await tx
      .select({ id: schema.specificationsSections.id, csiCode: schema.specificationsSections.csiCode, title: schema.specificationsSections.title })
      .from(schema.specificationsSections)
      .where(eq(schema.specificationsSections.id, submittal.specSectionId))
      .limit(1);

    const distribution = await tx
      .select()
      .from(schema.submittalDistribution)
      .where(eq(schema.submittalDistribution.submittalId, submittalId));

    const packages = await tx
      .select()
      .from(schema.submittalPackages)
      .where(eq(schema.submittalPackages.submittalId, submittalId))
      .orderBy(asc(schema.submittalPackages.packageNumber));

    const packagesWithRevisions: PackageWithRevisions[] = await Promise.all(
      packages.map(async (pkg) => {
        const revisions = await tx
          .select()
          .from(schema.submittalRevisions)
          .where(eq(schema.submittalRevisions.packageId, pkg.id))
          .orderBy(asc(schema.submittalRevisions.revisionNumber));

        const revisionsWithReviews = await Promise.all(
          revisions.map(async (rev) => {
            const reviews = await tx
              .select()
              .from(schema.submittalReviews)
              .where(eq(schema.submittalReviews.revisionId, rev.id))
              .orderBy(asc(schema.submittalReviews.sequenceOrder));
            return { ...rev, reviews };
          }),
        );

        return { ...pkg, revisions: revisionsWithReviews };
      }),
    );

    return { ...submittal, packages: packagesWithRevisions, specSection: specSection ?? null, distribution };
  });
}

export async function createSubmittalPackage(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  submittalId: string,
): Promise<SubmittalPackageRow> {
  requirePermission(ctx, "submittals", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [maxRow] = await tx
      .select({ value: max(schema.submittalPackages.packageNumber) })
      .from(schema.submittalPackages)
      .where(eq(schema.submittalPackages.submittalId, submittalId));

    const [pkg] = await tx
      .insert(schema.submittalPackages)
      .values({ submittalId, packageNumber: (maxRow?.value ?? 0) + 1 })
      .returning();
    if (!pkg) throw new Error("Failed to create submittal package");
    return pkg;
  });
}

/**
 * A single `ball_in_court_user_id` column can't represent "several parallel
 * reviewers are simultaneously on the hook" — this picks the reviewer with
 * the lowest sequence_order among the non-parallel ones as a reasonable
 * single point of contact, or leaves it null when every assigned reviewer
 * is parallel (nobody blocks anybody, so there's no single "next" person).
 * Flagged as a schema limitation, not silently worked around.
 */
function initialBallInCourt(reviewers: CreateSubmittalRevisionInput["reviewers"]): string | null {
  const sequential = reviewers.filter((r) => !r.isParallel).sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  return sequential[0]?.reviewerUserId ?? null;
}

export async function createSubmittalRevision(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  packageId: string,
  input: CreateSubmittalRevisionInput,
): Promise<SubmittalRevisionRow> {
  requirePermission(ctx, "submittals", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [pkg] = await tx.select().from(schema.submittalPackages).where(eq(schema.submittalPackages.id, packageId)).limit(1);
    if (!pkg) throw new NotFoundError("Submittal package not found");
    const [submittal] = await tx.select().from(schema.submittals).where(eq(schema.submittals.id, pkg.submittalId)).limit(1);
    if (!submittal) throw new Error("Submittal package references a missing submittal");

    const [maxRow] = await tx
      .select({ value: max(schema.submittalRevisions.revisionNumber) })
      .from(schema.submittalRevisions)
      .where(eq(schema.submittalRevisions.packageId, packageId));

    const [revision] = await tx
      .insert(schema.submittalRevisions)
      .values({
        packageId,
        revisionNumber: (maxRow?.value ?? 0) + 1,
        attachmentId: input.attachmentId,
        submittedDate: new Date(input.submittedDate),
      })
      .returning();
    if (!revision) throw new Error("Failed to create submittal revision");

    await tx.insert(schema.submittalReviews).values(
      input.reviewers.map((r) => ({
        revisionId: revision.id,
        reviewerUserId: r.reviewerUserId,
        sequenceOrder: r.sequenceOrder,
        isParallel: r.isParallel,
      })),
    );

    await tx
      .update(schema.submittals)
      .set({
        status: "in_review",
        ballInCourtUserId: initialBallInCourt(input.reviewers),
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: submittal.serverRevision + 1,
      })
      .where(eq(schema.submittals.id, pkg.submittalId));

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "submittal_revision",
      entityId: revision.id,
      action: "create",
      after: revision,
    });
    return revision;
  });
}

function isSequentialReviewEligible(review: SubmittalReviewRow, allReviews: SubmittalReviewRow[]): boolean {
  return allReviews
    .filter((r) => !r.isParallel && r.sequenceOrder < review.sequenceOrder)
    .every((r) => r.reviewedAt !== null);
}

/** Next single point of contact once at least one reviewer is still pending — see initialBallInCourt's doc comment for the same single-column limitation. */
function nextBallInCourt(allReviews: SubmittalReviewRow[]): string | null {
  const eligible = allReviews
    .filter((r) => r.reviewedAt === null && (r.isParallel || isSequentialReviewEligible(r, allReviews)))
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  return eligible[0]?.reviewerUserId ?? null;
}

export async function submitSubmittalReview(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  revisionId: string,
  reviewerUserId: string,
  input: SubmitSubmittalReviewInput,
): Promise<SubmittalReviewRow> {
  // Only "read" here, not "standard": submitting a review is authorized by
  // being the specific reviewer assigned below, not by the caller's
  // general write level on the module — a qa_qc or superintendent role
  // (read-only on submittals by default) must still be able to submit the
  // review they were explicitly assigned, the same way a punch item's
  // assignee can act on it without module-wide "standard" access.
  requirePermission(ctx, "submittals", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const allReviews = await tx.select().from(schema.submittalReviews).where(eq(schema.submittalReviews.revisionId, revisionId));
    const review = allReviews.find((r) => r.reviewerUserId === reviewerUserId);
    if (!review) throw new ApiError(403, "not_a_reviewer", "You are not an assigned reviewer for this revision");
    if (review.reviewedAt) throw new ApiError(400, "already_reviewed", "This reviewer has already submitted a response");
    if (!review.isParallel && !isSequentialReviewEligible(review, allReviews)) {
      throw new ApiError(400, "out_of_sequence", "Earlier sequential reviewers have not reviewed yet");
    }

    const [updatedReview] = await tx
      .update(schema.submittalReviews)
      .set({ responseCode: input.responseCode, reviewedAt: new Date() })
      .where(eq(schema.submittalReviews.id, review.id))
      .returning();
    if (!updatedReview) throw new Error("Failed to record submittal review");

    const refreshedReviews = allReviews.map((r) => (r.id === updatedReview.id ? updatedReview : r));
    const [revision] = await tx
      .select()
      .from(schema.submittalRevisions)
      .where(eq(schema.submittalRevisions.id, revisionId))
      .limit(1);
    if (!revision) throw new Error("Submittal revision disappeared mid-transaction");
    const [pkg] = await tx.select().from(schema.submittalPackages).where(eq(schema.submittalPackages.id, revision.packageId)).limit(1);
    if (!pkg) throw new Error("Submittal package disappeared mid-transaction");
    const [submittal] = await tx.select().from(schema.submittals).where(eq(schema.submittals.id, pkg.submittalId)).limit(1);
    if (!submittal) throw new Error("Submittal disappeared mid-transaction");

    const allReviewed = refreshedReviews.every((r) => r.reviewedAt !== null);
    if (allReviewed) {
      const passed = refreshedReviews.every((r) => r.responseCode !== null && PASSING_SUBMITTAL_RESPONSE_CODES.includes(r.responseCode));
      await tx
        .update(schema.submittals)
        .set({
          status: passed ? "approved" : "in_review",
          ballInCourtUserId: submittal.createdBy,
          updatedBy: userId,
          updatedAt: new Date(),
          serverRevision: submittal.serverRevision + 1,
        })
        .where(eq(schema.submittals.id, submittal.id));
    } else {
      await tx
        .update(schema.submittals)
        .set({
          ballInCourtUserId: nextBallInCourt(refreshedReviews),
          updatedBy: userId,
          updatedAt: new Date(),
          serverRevision: submittal.serverRevision + 1,
        })
        .where(eq(schema.submittals.id, submittal.id));
    }

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "submittal_review",
      entityId: updatedReview.id,
      action: "review",
      after: updatedReview,
    });
    return updatedReview;
  });
}

export async function closeSubmittal(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  submittalId: string,
): Promise<SubmittalRow> {
  requirePermission(ctx, "submittals", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [submittal] = await tx.select().from(schema.submittals).where(eq(schema.submittals.id, submittalId)).limit(1);
    if (!submittal) throw new ApiError(404, "not_found", "Submittal not found");
    if (submittal.status !== "approved") {
      throw new ApiError(400, "invalid_transition", "Only an approved submittal can be closed");
    }

    const [updated] = await tx
      .update(schema.submittals)
      .set({ status: "closed", updatedBy: userId, updatedAt: new Date(), serverRevision: submittal.serverRevision + 1 })
      .where(eq(schema.submittals.id, submittalId))
      .returning();
    if (!updated) throw new Error("Failed to close submittal");
    return updated;
  });
}

export interface SubmittalReportReview {
  reviewerName: string;
  sequenceOrder: number;
  isParallel: boolean;
  responseCode: SubmittalResponseCode | null;
  reviewedAt: Date | null;
}

export interface SubmittalReportRevision {
  revisionNumber: number;
  submittedDate: Date;
  reviews: SubmittalReportReview[];
}

export interface SubmittalReportData extends ReportBranding {
  projectName: string;
  number: string;
  title: string;
  specSectionLabel: string;
  status: SubmittalStatus;
  ballInCourtName: string | null;
  leadTimeDays: number | null;
  requiredOnSiteDate: Date | null;
  revisions: SubmittalReportRevision[];
}

/** Assembles everything the PDF report needs, mirroring inspection.service.ts's getInspectionReportData pattern. */
export async function getSubmittalReportData(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  submittalId: string,
): Promise<SubmittalReportData> {
  requirePermission(ctx, "submittals", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [submittal] = await tx.select().from(schema.submittals).where(eq(schema.submittals.id, submittalId)).limit(1);
    if (!submittal) throw new NotFoundError("Submittal not found");

    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, submittal.projectId)).limit(1);
    const [specSection] = await tx
      .select()
      .from(schema.specificationsSections)
      .where(eq(schema.specificationsSections.id, submittal.specSectionId))
      .limit(1);
    const [ballInCourtUser] = submittal.ballInCourtUserId
      ? await tx.select().from(schema.users).where(eq(schema.users.id, submittal.ballInCourtUserId)).limit(1)
      : [undefined];

    const packages = await tx
      .select()
      .from(schema.submittalPackages)
      .where(eq(schema.submittalPackages.submittalId, submittalId))
      .orderBy(asc(schema.submittalPackages.packageNumber));
    const packageIds = packages.map((p) => p.id);
    const revisionRows =
      packageIds.length > 0
        ? await tx
            .select()
            .from(schema.submittalRevisions)
            .where(inArray(schema.submittalRevisions.packageId, packageIds))
            .orderBy(asc(schema.submittalRevisions.revisionNumber))
        : [];
    const revisionIds = revisionRows.map((r) => r.id);
    const reviewRows =
      revisionIds.length > 0
        ? await tx
            .select()
            .from(schema.submittalReviews)
            .where(inArray(schema.submittalReviews.revisionId, revisionIds))
            .orderBy(asc(schema.submittalReviews.sequenceOrder))
        : [];
    const reviewerIds = [...new Set(reviewRows.map((r) => r.reviewerUserId))];
    const reviewers = reviewerIds.length > 0 ? await tx.select().from(schema.users).where(inArray(schema.users.id, reviewerIds)) : [];
    const reviewerNameById = new Map(reviewers.map((u) => [u.id, u.name]));

    const revisions: SubmittalReportRevision[] = revisionRows.map((rev) => ({
      revisionNumber: rev.revisionNumber,
      submittedDate: rev.submittedDate,
      reviews: reviewRows
        .filter((r) => r.revisionId === rev.id)
        .map((r) => ({
          reviewerName: reviewerNameById.get(r.reviewerUserId) ?? "Unknown",
          sequenceOrder: r.sequenceOrder,
          isParallel: r.isParallel,
          responseCode: r.responseCode,
          reviewedAt: r.reviewedAt,
        })),
    }));

    const branding = await resolveAuthorCompanyBranding(tx, submittal.projectId, submittal.createdBy);

    return {
      ...branding,
      projectName: project?.name ?? "",
      number: submittal.number,
      title: submittal.title,
      specSectionLabel: specSection ? `${specSection.csiCode} — ${specSection.title}` : "",
      status: submittal.status,
      ballInCourtName: ballInCourtUser?.name ?? null,
      leadTimeDays: submittal.leadTimeDays,
      requiredOnSiteDate: submittal.requiredOnSiteDate,
      revisions,
    };
  });
}

export interface SubmittalListRow {
  number: string;
  title: string;
  status: SubmittalStatus;
  ballInCourtName: string | null;
  requiredOnSiteDate: Date | null;
}

export interface SubmittalListReportData extends ReportBranding {
  projectName: string;
  rows: SubmittalListRow[];
}

/** "Export all" register for the project's submittals (Phase 13), branded with the requesting user's own company. */
export async function getSubmittalListReportData(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<SubmittalListReportData> {
  requirePermission(ctx, "submittals", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
    const submittals = await tx.select().from(schema.submittals).where(eq(schema.submittals.projectId, projectId)).orderBy(schema.submittals.number);

    const ballInCourtIds = [...new Set(submittals.map((s) => s.ballInCourtUserId).filter((id): id is string => id !== null))];
    const ballInCourtUsers = ballInCourtIds.length > 0 ? await tx.select().from(schema.users).where(inArray(schema.users.id, ballInCourtIds)) : [];
    const nameById = new Map(ballInCourtUsers.map((u) => [u.id, u.name]));

    const branding = await resolveAuthorCompanyBranding(tx, projectId, userId);

    return {
      ...branding,
      projectName: project?.name ?? "",
      rows: submittals.map((s) => ({
        number: s.number,
        title: s.title,
        status: s.status,
        ballInCourtName: s.ballInCourtUserId ? (nameById.get(s.ballInCourtUserId) ?? null) : null,
        requiredOnSiteDate: s.requiredOnSiteDate,
      })),
    };
  });
}
