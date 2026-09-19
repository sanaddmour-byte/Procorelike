import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  averageDurationDays,
  bucketByWeek,
  bucketSumByMonth,
  hasPermission,
  requirePermission,
  type PermissionContext,
  type WeeklyBucket,
} from "@siteops/shared";
import { and, eq, inArray } from "drizzle-orm";

/** 12 weeks (~3 months) and 6 months are enough to show a real trend without querying the entire project history on every load. */
const TREND_WEEKS = 12;
const COST_TREND_MONTHS = 6;

export interface WeeklyPair {
  weekStart: string;
  created: number;
  resolved: number;
}

export interface RfiAnalytics {
  createdVsAnsweredWeekly: WeeklyPair[];
  avgResponseTimeDays: number | null;
  byStatus: Record<string, number>;
}

export interface PunchListAnalytics {
  createdVsClosedWeekly: WeeklyPair[];
  avgCycleTimeDays: number | null;
  byStatus: Record<string, number>;
}

export interface SubmittalAnalytics {
  createdVsResolvedWeekly: WeeklyPair[];
  avgCycleTimeDays: number | null;
  byStatus: Record<string, number>;
}

export interface SafetyAnalytics {
  incidentsWeekly: { weekStart: string; count: number }[];
  bySeverity: Record<string, number>;
  avgTimeToCloseDays: number | null;
}

export interface ChangeOrderAnalytics {
  approvedCostImpactByMonth: { month: string; total: number }[];
  byStatus: Record<string, number>;
}

export interface ProjectAnalytics {
  rfis?: RfiAnalytics;
  punchList?: PunchListAnalytics;
  submittals?: SubmittalAnalytics;
  safety?: SafetyAnalytics;
  changeOrders?: ChangeOrderAnalytics;
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

function mergeWeekly(created: WeeklyBucket[], resolved: WeeklyBucket[]): WeeklyPair[] {
  return created.map((c, i) => ({ weekStart: c.weekStart, created: c.count, resolved: resolved[i]?.count ?? 0 }));
}

function durationsMs(pairs: { start: Date; end: Date }[]): number[] {
  return pairs.map((p) => p.end.getTime() - p.start.getTime()).filter((ms) => ms >= 0);
}

/** Statuses a submittal is no longer actively "in review" in -- reaching one of these is what "resolved" means for this chart. */
const SUBMITTAL_RESOLVED_STATUSES = new Set(["approved", "approved_as_noted", "revise_resubmit", "rejected", "closed"]);

/**
 * Every section is independently gated on that module's own read
 * permission and simply omitted if the caller can't see it, mirroring
 * dashboard.service.ts's getProjectDashboard -- but the endpoint itself
 * additionally requires `reports` read, the first real use of that
 * long-defined-but-unused permission module (docs/ROADMAP.md Phase 17
 * gate report). All trend data is derived from timestamps the app
 * already stores (created_at, status-change history, occurred_at) --
 * nothing here is a synthetic snapshot, so there is no history before a
 * record's own creation date to show.
 */
export async function getProjectAnalytics(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  now: Date = new Date(),
): Promise<ProjectAnalytics> {
  requirePermission(ctx, "reports", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const analytics: ProjectAnalytics = {};

    if (hasPermission(ctx, "rfis", "read")) {
      const rows = await tx.select().from(schema.rfis).where(eq(schema.rfis.projectId, projectId));
      const rfiIds = rows.map((r) => r.id);
      const officialResponses =
        rfiIds.length > 0
          ? await tx
              .select()
              .from(schema.rfiResponses)
              .where(and(inArray(schema.rfiResponses.rfiId, rfiIds), eq(schema.rfiResponses.isOfficial, true)))
          : [];
      const rfiById = new Map(rows.map((r) => [r.id, r]));
      const responseTimes = durationsMs(
        officialResponses.flatMap((resp) => {
          const rfi = rfiById.get(resp.rfiId);
          return rfi ? [{ start: rfi.createdAt, end: resp.createdAt }] : [];
        }),
      );

      analytics.rfis = {
        createdVsAnsweredWeekly: mergeWeekly(
          bucketByWeek(
            rows.map((r) => r.createdAt),
            TREND_WEEKS,
            now,
          ),
          bucketByWeek(
            officialResponses.map((r) => r.createdAt),
            TREND_WEEKS,
            now,
          ),
        ),
        avgResponseTimeDays: averageDurationDays(responseTimes),
        byStatus: countBy(rows.map((r) => r.status)),
      };
    }

    if (hasPermission(ctx, "punch_list", "read")) {
      const rows = await tx.select().from(schema.punchItems).where(eq(schema.punchItems.projectId, projectId));
      const itemIds = rows.map((r) => r.id);
      const closedHistory =
        itemIds.length > 0
          ? await tx
              .select()
              .from(schema.punchItemHistory)
              .where(and(inArray(schema.punchItemHistory.punchItemId, itemIds), eq(schema.punchItemHistory.toStatus, "closed")))
          : [];
      const itemById = new Map(rows.map((r) => [r.id, r]));
      const cycleTimes = durationsMs(
        closedHistory.flatMap((h) => {
          const item = itemById.get(h.punchItemId);
          return item ? [{ start: item.createdAt, end: h.changedAt }] : [];
        }),
      );

      analytics.punchList = {
        createdVsClosedWeekly: mergeWeekly(
          bucketByWeek(
            rows.map((r) => r.createdAt),
            TREND_WEEKS,
            now,
          ),
          bucketByWeek(
            closedHistory.map((h) => h.changedAt),
            TREND_WEEKS,
            now,
          ),
        ),
        avgCycleTimeDays: averageDurationDays(cycleTimes),
        byStatus: countBy(rows.map((r) => r.status)),
      };
    }

    if (hasPermission(ctx, "submittals", "read")) {
      const rows = await tx.select().from(schema.submittals).where(eq(schema.submittals.projectId, projectId));
      const resolved = rows.filter((r) => SUBMITTAL_RESOLVED_STATUSES.has(r.status));
      const cycleTimes = durationsMs(resolved.map((r) => ({ start: r.createdAt, end: r.updatedAt })));

      analytics.submittals = {
        createdVsResolvedWeekly: mergeWeekly(
          bucketByWeek(
            rows.map((r) => r.createdAt),
            TREND_WEEKS,
            now,
          ),
          bucketByWeek(
            resolved.map((r) => r.updatedAt),
            TREND_WEEKS,
            now,
          ),
        ),
        avgCycleTimeDays: averageDurationDays(cycleTimes),
        byStatus: countBy(rows.map((r) => r.status)),
      };
    }

    if (hasPermission(ctx, "safety", "read")) {
      const rows = await tx.select().from(schema.safetyIncidents).where(eq(schema.safetyIncidents.projectId, projectId));
      const closed = rows.filter((r): r is typeof r & { closedAt: Date } => r.closedAt !== null);
      const timeToCloseMs = durationsMs(closed.map((r) => ({ start: r.occurredAt, end: r.closedAt })));

      analytics.safety = {
        incidentsWeekly: bucketByWeek(
          rows.map((r) => r.occurredAt),
          TREND_WEEKS,
          now,
        ),
        bySeverity: countBy(rows.map((r) => r.severity)),
        avgTimeToCloseDays: averageDurationDays(timeToCloseMs),
      };
    }

    if (hasPermission(ctx, "change_management", "read")) {
      const rows = await tx.select().from(schema.changeOrders).where(eq(schema.changeOrders.projectId, projectId));
      const approved = rows.filter((r) => r.status === "approved");
      const approvalEntries = approved.map((r) => {
        const lastApproval = r.approvalChain[r.approvalChain.length - 1];
        const date = lastApproval ? new Date(lastApproval.approvedAt) : r.updatedAt;
        return { date, amount: Number(r.costImpact) };
      });

      analytics.changeOrders = {
        approvedCostImpactByMonth: bucketSumByMonth(approvalEntries, COST_TREND_MONTHS, now),
        byStatus: countBy(rows.map((r) => r.status)),
      };
    }

    return analytics;
  });
}
