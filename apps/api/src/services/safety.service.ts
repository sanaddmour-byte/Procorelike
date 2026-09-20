import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  DEFAULT_PAGE_SIZE,
  requirePermission,
  SAFETY_INCIDENT_STATUS_TRANSITIONS,
  SAFETY_OBSERVATION_STATUS_TRANSITIONS,
  type CreateSafetyIncidentInput,
  type CreateSafetyObservationInput,
  type ListSafetyIncidentsQuery,
  type ListSafetyObservationsQuery,
  type PaginatedResult,
  type PermissionContext,
  type SafetyIncidentSortKey,
  type SafetyObservationSortKey,
  type TransitionSafetyIncidentStatusInput,
} from "@siteops/shared";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

type SafetyIncidentRow = typeof schema.safetyIncidents.$inferSelect;
type SafetyObservationRow = typeof schema.safetyObservations.$inferSelect;

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export async function createSafetyIncident(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateSafetyIncidentInput,
): Promise<SafetyIncidentRow> {
  requirePermission(ctx, "safety", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.safetyIncidents)
      .values({ ...input, occurredAt: new Date(input.occurredAt), reportedBy: userId })
      .returning();
    if (!row) throw new Error("Failed to create safety incident");

    await writeAuditLog(tx, { actorId: userId, entityType: "safety_incident", entityId: row.id, action: "create", after: row });
    return row;
  });
}

export async function findSafetyIncidentById(
  appDb: Database,
  userId: string,
  incidentId: string,
): Promise<SafetyIncidentRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx.select().from(schema.safetyIncidents).where(eq(schema.safetyIncidents.id, incidentId)).limit(1);
    return row;
  });
}

const SAFETY_INCIDENT_SORT_COLUMNS: Record<
  SafetyIncidentSortKey,
  | typeof schema.safetyIncidents.description
  | typeof schema.safetyIncidents.occurredAt
  | typeof schema.safetyIncidents.severity
  | typeof schema.safetyIncidents.status
> = {
  description: schema.safetyIncidents.description,
  occurredAt: schema.safetyIncidents.occurredAt,
  severity: schema.safetyIncidents.severity,
  status: schema.safetyIncidents.status,
};

export async function listSafetyIncidents(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListSafetyIncidentsQuery = {},
): Promise<PaginatedResult<SafetyIncidentRow>> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.safetyIncidents.projectId, projectId)];

    if (query.status) conditions.push(eq(schema.safetyIncidents.status, query.status));
    if (query.search) conditions.push(ilike(schema.safetyIncidents.description, `%${query.search}%`));
    const where = and(...conditions)!;

    const sortColumn = SAFETY_INCIDENT_SORT_COLUMNS[query.sort ?? "occurredAt"];
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.safetyIncidents).where(where).orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.safetyIncidents).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export interface OshaLogRow {
  incidentId: string;
  occurredAt: Date;
  description: string;
  injuredPersonName: string | null;
  oshaClassification: string;
  injuryIllnessType: string | null;
  bodyPart: string | null;
  daysAwayFromWork: number;
  daysJobTransferOrRestriction: number;
}

export interface SafetySummary {
  incidentsBySeverity: Record<string, number>;
  incidentsByStatus: Record<string, number>;
  observationsByCategory: Record<string, number>;
  observationsByStatus: Record<string, number>;
  oshaRecordableCount: number;
  totalDaysAwayFromWork: number;
  totalDaysJobTransferOrRestriction: number;
}

/** Procore's OSHA 300 Log (29 CFR 1904): every incident classified as recordable for a given calendar year, in the shape needed to populate the standard form's columns -- not a facsimile of the form itself, but the same underlying dataset. */
export async function getOshaLog(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  year: number,
): Promise<OshaLogRow[]> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx.select().from(schema.safetyIncidents).where(eq(schema.safetyIncidents.projectId, projectId));
    return rows
      .filter((r) => r.oshaClassification !== "not_recordable" && r.occurredAt.getUTCFullYear() === year)
      .map((r) => ({
        incidentId: r.id,
        occurredAt: r.occurredAt,
        description: r.description,
        injuredPersonName: r.injuredPersonName,
        oshaClassification: r.oshaClassification,
        injuryIllnessType: r.injuryIllnessType,
        bodyPart: r.bodyPart,
        daysAwayFromWork: r.daysAwayFromWork,
        daysJobTransferOrRestriction: r.daysJobTransferOrRestriction,
      }));
  });
}

/** A lightweight trend view -- counts by severity/category/status plus OSHA totals -- rather than a full analytics/BI surface. */
export async function getSafetySummary(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<SafetySummary> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const incidents = await tx.select().from(schema.safetyIncidents).where(eq(schema.safetyIncidents.projectId, projectId));
    const observations = await tx.select().from(schema.safetyObservations).where(eq(schema.safetyObservations.projectId, projectId));

    const tally = <T extends string>(items: T[]): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const item of items) out[item] = (out[item] ?? 0) + 1;
      return out;
    };

    const recordable = incidents.filter((i) => i.oshaClassification !== "not_recordable");

    return {
      incidentsBySeverity: tally(incidents.map((i) => i.severity)),
      incidentsByStatus: tally(incidents.map((i) => i.status)),
      observationsByCategory: tally(observations.map((o) => o.category)),
      observationsByStatus: tally(observations.map((o) => o.status)),
      oshaRecordableCount: recordable.length,
      totalDaysAwayFromWork: recordable.reduce((sum, i) => sum + i.daysAwayFromWork, 0),
      totalDaysJobTransferOrRestriction: recordable.reduce((sum, i) => sum + i.daysJobTransferOrRestriction, 0),
    };
  });
}

export async function transitionSafetyIncidentStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  incidentId: string,
  input: TransitionSafetyIncidentStatusInput,
): Promise<SafetyIncidentRow> {
  requirePermission(ctx, "safety", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.safetyIncidents).where(eq(schema.safetyIncidents.id, incidentId)).limit(1);
    if (!existing) throw new NotFoundError("Safety incident not found");

    const allowed = SAFETY_INCIDENT_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(
        409,
        "invalid_status_transition",
        `Cannot move a safety incident from '${existing.status}' to '${input.toStatus}'`,
      );
    }
    if (input.toStatus === "closed" && !input.correctiveAction && !existing.correctiveAction) {
      throw new ApiError(422, "corrective_action_required", "A corrective action is required to close an incident");
    }

    const [updated] = await tx
      .update(schema.safetyIncidents)
      .set({
        status: input.toStatus,
        correctiveAction: input.correctiveAction ?? existing.correctiveAction,
        closedBy: input.toStatus === "closed" ? userId : null,
        closedAt: input.toStatus === "closed" ? new Date() : null,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(schema.safetyIncidents.id, incidentId))
      .returning();
    if (!updated) throw new Error("Failed to transition safety incident");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "safety_incident",
      entityId: incidentId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export async function createSafetyObservation(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateSafetyObservationInput,
): Promise<SafetyObservationRow> {
  requirePermission(ctx, "safety", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [row] = await tx
      .insert(schema.safetyObservations)
      .values({ ...input, observedAt: new Date(input.observedAt), reportedBy: userId })
      .returning();
    if (!row) throw new Error("Failed to create safety observation");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "safety_observation",
      entityId: row.id,
      action: "create",
      after: row,
    });
    return row;
  });
}

export async function findSafetyObservationById(
  appDb: Database,
  userId: string,
  observationId: string,
): Promise<SafetyObservationRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.safetyObservations)
      .where(eq(schema.safetyObservations.id, observationId))
      .limit(1);
    return row;
  });
}

const SAFETY_OBSERVATION_SORT_COLUMNS: Record<
  SafetyObservationSortKey,
  | typeof schema.safetyObservations.description
  | typeof schema.safetyObservations.observedAt
  | typeof schema.safetyObservations.category
  | typeof schema.safetyObservations.status
> = {
  description: schema.safetyObservations.description,
  observedAt: schema.safetyObservations.observedAt,
  category: schema.safetyObservations.category,
  status: schema.safetyObservations.status,
};

export async function listSafetyObservations(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  query: ListSafetyObservationsQuery = {},
): Promise<PaginatedResult<SafetyObservationRow>> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const conditions = [eq(schema.safetyObservations.projectId, projectId)];

    if (query.category) conditions.push(eq(schema.safetyObservations.category, query.category));
    if (query.status) conditions.push(eq(schema.safetyObservations.status, query.status));
    if (query.search) conditions.push(ilike(schema.safetyObservations.description, `%${query.search}%`));
    const where = and(...conditions)!;

    const sortColumn = SAFETY_OBSERVATION_SORT_COLUMNS[query.sort ?? "observedAt"];
    const orderFn = query.direction === "desc" ? desc : asc;

    const isPaginated = query.page !== undefined || query.pageSize !== undefined;
    let rowsQuery = tx.select().from(schema.safetyObservations).where(where).orderBy(orderFn(sortColumn));
    if (isPaginated) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query.page ?? 1;
      rowsQuery = rowsQuery.limit(pageSize).offset((page - 1) * pageSize) as typeof rowsQuery;
    }

    const [rows, [totalRow]] = await Promise.all([
      rowsQuery,
      tx.select({ value: count() }).from(schema.safetyObservations).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  });
}

export async function resolveSafetyObservation(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  observationId: string,
): Promise<SafetyObservationRow> {
  requirePermission(ctx, "safety", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.safetyObservations)
      .where(eq(schema.safetyObservations.id, observationId))
      .limit(1);
    if (!existing) throw new NotFoundError("Safety observation not found");

    const toStatus = existing.status === "open" ? "resolved" : "open";
    const allowed = SAFETY_OBSERVATION_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes(toStatus)) {
      throw new ApiError(409, "invalid_status_transition", `Cannot move a safety observation from '${existing.status}'`);
    }

    const [updated] = await tx
      .update(schema.safetyObservations)
      .set({
        status: toStatus,
        resolvedBy: toStatus === "resolved" ? userId : null,
        resolvedAt: toStatus === "resolved" ? new Date() : null,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(schema.safetyObservations.id, observationId))
      .returning();
    if (!updated) throw new Error("Failed to update safety observation");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "safety_observation",
      entityId: observationId,
      action: "status_transition",
      before: { status: existing.status },
      after: { status: updated.status },
    });
    return updated;
  });
}
