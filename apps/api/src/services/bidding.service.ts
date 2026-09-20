import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  BID_PACKAGE_STATUS_TRANSITIONS,
  DEFAULT_PAGE_SIZE,
  formatBidPackageNumber,
  formatCommitmentNumber,
  requirePermission,
  type AwardBidInput,
  type BidPackageSortKey,
  type CreateBidPackageInput,
  type InviteBidderInput,
  type ListBidPackagesQuery,
  type LogBidInput,
  type PaginatedResult,
  type PermissionContext,
  type TransitionBidPackageStatusInput,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type BidPackageRow = typeof schema.bidPackages.$inferSelect;
type BidInvitationRow = typeof schema.bidInvitations.$inferSelect;
type BidRow = typeof schema.bids.$inferSelect;
type CommitmentRow = typeof schema.commitments.$inferSelect;

export interface BidPackageDetail extends BidPackageRow {
  invitations: BidInvitationRow[];
  bids: BidRow[];
}

export async function createBidPackage(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateBidPackageInput,
): Promise<BidPackageRow> {
  requirePermission(ctx, "bidding", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const seq = await nextSequenceNumber(tx, input.projectId, "BID");
    const [row] = await tx
      .insert(schema.bidPackages)
      .values({
        projectId: input.projectId,
        number: formatBidPackageNumber(seq),
        title: input.title,
        description: input.description,
        costCodeId: input.costCodeId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("Failed to create bid package");

    await writeAuditLog(tx, { actorId: userId, entityType: "bid_package", entityId: row.id, action: "create", after: row });
    return row;
  });
}

/** Peek used by routes to resolve which project a bid package belongs to before loading the full permission context. */
export async function findBidPackageById(appDb: Database, userId: string, bidPackageId: string): Promise<BidPackageRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.bidPackages).where(eq(schema.bidPackages.id, bidPackageId)).limit(1);
    return row;
  });
}

/** Peek used by routes to resolve which project a bid (via its bid package) belongs to before loading the full permission context. */
export async function findBidWithPackage(
  appDb: Database,
  userId: string,
  bidId: string,
): Promise<{ bid: BidRow; bidPackage: BidPackageRow } | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [bid] = await tx.select().from(schema.bids).where(eq(schema.bids.id, bidId)).limit(1);
    if (!bid) return undefined;
    const [bidPackage] = await tx.select().from(schema.bidPackages).where(eq(schema.bidPackages.id, bid.bidPackageId)).limit(1);
    if (!bidPackage) return undefined;
    return { bid, bidPackage };
  });
}

const BID_PACKAGE_SORT_COLUMNS: Record<
  BidPackageSortKey,
  typeof schema.bidPackages.number | typeof schema.bidPackages.title | typeof schema.bidPackages.dueDate | typeof schema.bidPackages.status
> = {
  number: schema.bidPackages.number,
  title: schema.bidPackages.title,
  dueDate: schema.bidPackages.dueDate,
  status: schema.bidPackages.status,
};

export async function listBidPackages(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListBidPackagesQuery = {},
): Promise<PaginatedResult<BidPackageRow>> {
  requirePermission(ctx, "bidding", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.bidPackages.projectId, projectId)];

    if (query.status) conditions.push(eq(schema.bidPackages.status, query.status));
    if (query.search) {
      conditions.push(or(ilike(schema.bidPackages.number, `%${query.search}%`), ilike(schema.bidPackages.title, `%${query.search}%`))!);
    }
    const where = and(...conditions)!;

    const sortColumn = BID_PACKAGE_SORT_COLUMNS[query.sort ?? "number"];
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.bidPackages).where(where).orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.bidPackages).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function getBidPackage(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  bidPackageId: string,
): Promise<BidPackageDetail | undefined> {
  requirePermission(ctx, "bidding", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [bidPackage] = await tx.select().from(schema.bidPackages).where(eq(schema.bidPackages.id, bidPackageId)).limit(1);
    if (!bidPackage) return undefined;

    const [invitations, bidRows] = await Promise.all([
      tx.select().from(schema.bidInvitations).where(eq(schema.bidInvitations.bidPackageId, bidPackageId)),
      tx.select().from(schema.bids).where(eq(schema.bids.bidPackageId, bidPackageId)),
    ]);
    return { ...bidPackage, invitations, bids: bidRows };
  });
}

export async function transitionBidPackageStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  bidPackageId: string,
  input: TransitionBidPackageStatusInput,
): Promise<BidPackageRow> {
  requirePermission(ctx, "bidding", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.bidPackages).where(eq(schema.bidPackages.id, bidPackageId)).limit(1);
    if (!existing) throw new NotFoundError("Bid package not found");

    const allowed = BID_PACKAGE_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(409, "invalid_status_transition", `Cannot move a bid package from '${existing.status}' to '${input.toStatus}'`);
    }

    const [updated] = await tx
      .update(schema.bidPackages)
      .set({ status: input.toStatus, updatedBy: userId, updatedAt: new Date(), serverRevision: existing.serverRevision + 1 })
      .where(eq(schema.bidPackages.id, bidPackageId))
      .returning();
    if (!updated) throw new Error("Failed to transition bid package");
    return updated;
  });
}

export async function inviteBidder(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  bidPackageId: string,
  input: InviteBidderInput,
): Promise<BidInvitationRow> {
  requirePermission(ctx, "bidding", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [bidPackage] = await tx.select().from(schema.bidPackages).where(eq(schema.bidPackages.id, bidPackageId)).limit(1);
    if (!bidPackage) throw new NotFoundError("Bid package not found");

    try {
      const [row] = await tx.insert(schema.bidInvitations).values({ bidPackageId, companyId: input.companyId }).returning();
      if (!row) throw new Error("Failed to invite bidder");
      return row;
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        throw new ApiError(409, "already_invited", "This company is already invited to bid on this package");
      }
      throw err;
    }
  });
}

export async function logBid(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  bidPackageId: string,
  input: LogBidInput,
): Promise<BidRow> {
  requirePermission(ctx, "bidding", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [bidPackage] = await tx.select().from(schema.bidPackages).where(eq(schema.bidPackages.id, bidPackageId)).limit(1);
    if (!bidPackage) throw new NotFoundError("Bid package not found");
    if (bidPackage.status === "awarded" || bidPackage.status === "canceled") {
      throw new ApiError(409, "bid_package_closed", `Cannot log a bid against a '${bidPackage.status}' bid package`);
    }

    let row: BidRow;
    try {
      const [inserted] = await tx
        .insert(schema.bids)
        .values({
          bidPackageId,
          companyId: input.companyId,
          amount: input.amount.toString(),
          alternates: input.alternates,
          exclusions: input.exclusions,
          createdBy: userId,
        })
        .returning();
      if (!inserted) throw new Error("Failed to log bid");
      row = inserted;
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        throw new ApiError(409, "bid_already_logged", "This company already has a bid logged against this package");
      }
      throw err;
    }

    await tx
      .update(schema.bidInvitations)
      .set({ status: "submitted", respondedAt: new Date() })
      .where(and(eq(schema.bidInvitations.bidPackageId, bidPackageId), eq(schema.bidInvitations.companyId, input.companyId)));

    await writeAuditLog(tx, { actorId: userId, entityType: "bid", entityId: row.id, action: "create", after: row });
    return row;
  });
}

export interface AwardBidResult {
  bidPackage: BidPackageRow;
  bid: BidRow;
  commitment: CommitmentRow | null;
}

/**
 * Awards one bid: rejects every other still-open bid on the same package,
 * closes/awards the package, and -- when asked -- creates a Commitment
 * (packages/financial.ts) seeded from the winning bid's amount, mirroring
 * Procore's own Bid Package -> Award -> Commitment handoff.
 */
export async function awardBid(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  bidId: string,
  input: AwardBidInput,
): Promise<AwardBidResult> {
  requirePermission(ctx, "bidding", "admin");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [bid] = await tx.select().from(schema.bids).where(eq(schema.bids.id, bidId)).limit(1);
    if (!bid) throw new NotFoundError("Bid not found");

    const [bidPackage] = await tx.select().from(schema.bidPackages).where(eq(schema.bidPackages.id, bid.bidPackageId)).limit(1);
    if (!bidPackage) throw new NotFoundError("Bid package not found");
    if (bidPackage.status === "awarded" || bidPackage.status === "canceled") {
      throw new ApiError(409, "invalid_status_transition", `Cannot award a '${bidPackage.status}' bid package`);
    }
    if (bid.status !== "submitted" && bid.status !== "shortlisted") {
      throw new ApiError(409, "invalid_status_transition", `Cannot award a bid in status '${bid.status}'`);
    }

    const [awardedBid] = await tx.update(schema.bids).set({ status: "awarded" }).where(eq(schema.bids.id, bidId)).returning();
    if (!awardedBid) throw new Error("Failed to award bid");

    await tx
      .update(schema.bids)
      .set({ status: "rejected" })
      .where(
        and(
          eq(schema.bids.bidPackageId, bidPackage.id),
          ne(schema.bids.id, bidId),
          inArray(schema.bids.status, ["submitted", "shortlisted"]),
        ),
      );

    const [awardedPackage] = await tx
      .update(schema.bidPackages)
      .set({ status: "awarded", updatedBy: userId, updatedAt: new Date(), serverRevision: bidPackage.serverRevision + 1 })
      .where(eq(schema.bidPackages.id, bidPackage.id))
      .returning();
    if (!awardedPackage) throw new Error("Failed to award bid package");

    let commitment: CommitmentRow | null = null;
    if (input.createCommitment) {
      const seq = await nextSequenceNumber(tx, bidPackage.projectId, "SC");
      const [commitmentRow] = await tx
        .insert(schema.commitments)
        .values({
          projectId: bidPackage.projectId,
          number: formatCommitmentNumber("subcontract", seq),
          title: bidPackage.title,
          companyId: awardedBid.companyId,
          type: "subcontract",
          costCodeId: bidPackage.costCodeId,
          createdBy: userId,
        })
        .returning();
      if (!commitmentRow) throw new Error("Failed to create commitment from awarded bid");
      commitment = commitmentRow;

      if (bidPackage.costCodeId) {
        await tx.insert(schema.commitmentLineItems).values({
          commitmentId: commitmentRow.id,
          costCodeId: bidPackage.costCodeId,
          description: bidPackage.title,
          scheduleOfValuesAmount: awardedBid.amount,
        });
      }
    }

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "bid",
      entityId: bidId,
      action: "award",
      before: { status: bid.status },
      after: { status: "awarded", commitmentId: commitment?.id ?? null },
    });

    return { bidPackage: awardedPackage, bid: awardedBid, commitment };
  });
}
