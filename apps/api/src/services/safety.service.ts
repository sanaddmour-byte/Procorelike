import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  requirePermission,
  SAFETY_INCIDENT_STATUS_TRANSITIONS,
  SAFETY_OBSERVATION_STATUS_TRANSITIONS,
  type CreateSafetyIncidentInput,
  type CreateSafetyObservationInput,
  type PermissionContext,
  type TransitionSafetyIncidentStatusInput,
} from "@siteops/shared";
import { eq } from "drizzle-orm";
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

export async function listSafetyIncidents(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<SafetyIncidentRow[]> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.safetyIncidents).where(eq(schema.safetyIncidents.projectId, projectId));
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

export async function listSafetyObservations(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<SafetyObservationRow[]> {
  requirePermission(ctx, "safety", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.safetyObservations).where(eq(schema.safetyObservations.projectId, projectId));
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
