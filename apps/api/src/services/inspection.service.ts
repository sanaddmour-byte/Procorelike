import { nextSequenceNumber, schema, withRequestContext, type Database, type Tx } from "@siteops/db";
import {
  formatGeneratedPunchItemDescription,
  formatInspectionResponseValue,
  formatPunchItemNumber,
  hasPermission,
  INSPECTION_STATUS_TRANSITIONS,
  mergeFields,
  requirePermission,
  shouldGeneratePunchItem,
  type ChecklistResponseType,
  type CompleteInspectionInput,
  type CreateInspectionInput,
  type FieldConflict,
  type InspectionResponseValue,
  type InspectionStatus,
  type PermissionContext,
  type TransitionInspectionStatusInput,
  type UpdateInspectionResponsesInput,
} from "@siteops/shared";
import { and, eq, inArray } from "drizzle-orm";
import { ApiError, NotFoundError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

type InspectionRow = typeof schema.inspections.$inferSelect;
type InspectionResponseRow = typeof schema.inspectionResponses.$inferSelect;
type ChecklistTemplateItemRow = typeof schema.checklistTemplateItems.$inferSelect;

export interface InspectionDetail extends InspectionRow {
  templateTitle: string;
  responses: InspectionResponseRow[];
}

/**
 * Applies one submitted response: upserts the row, and — the docs/DATA_MODEL.md
 * §8 rule — auto-generates a linked punch item the first time a pass/fail
 * item fails. Correcting a failed answer later never retracts an
 * already-generated punch item: a real defect once flagged shouldn't
 * silently vanish because a checklist answer changed.
 */
async function applyResponse(
  tx: Tx,
  userId: string,
  inspection: InspectionRow,
  templateItem: ChecklistTemplateItemRow,
  value: InspectionResponseValue,
): Promise<InspectionResponseRow> {
  const [existing] = await tx
    .select()
    .from(schema.inspectionResponses)
    .where(and(eq(schema.inspectionResponses.inspectionId, inspection.id), eq(schema.inspectionResponses.templateItemId, templateItem.id)))
    .limit(1);

  const photoAttachmentId = value.type === "photo" ? value.attachmentId : undefined;

  let generatedPunchItemId = existing?.generatedPunchItemId ?? null;
  if (!generatedPunchItemId && shouldGeneratePunchItem(value)) {
    const seq = await nextSequenceNumber(tx, inspection.projectId, "PI");
    const [punchItem] = await tx
      .insert(schema.punchItems)
      .values({
        projectId: inspection.projectId,
        number: formatPunchItemNumber(seq),
        description: formatGeneratedPunchItemDescription(templateItem.prompt, `Inspection ${inspection.id}`),
        locationId: inspection.locationId,
        priority: "medium",
        createdBy: userId,
      })
      .returning();
    if (punchItem) {
      await tx.insert(schema.punchItemHistory).values({
        punchItemId: punchItem.id,
        toStatus: "open",
        changedBy: userId,
        note: `Auto-generated from failed inspection item: "${templateItem.prompt}"`,
      });
      generatedPunchItemId = punchItem.id;
    }
  }

  if (existing) {
    const [updated] = await tx
      .update(schema.inspectionResponses)
      .set({ value, photoAttachmentId, generatedPunchItemId })
      .where(eq(schema.inspectionResponses.id, existing.id))
      .returning();
    if (!updated) throw new Error("Failed to update inspection response");
    return updated;
  }

  const [created] = await tx
    .insert(schema.inspectionResponses)
    .values({ inspectionId: inspection.id, templateItemId: templateItem.id, value, photoAttachmentId, generatedPunchItemId })
    .returning();
  if (!created) throw new Error("Failed to create inspection response");
  return created;
}

export async function createInspection(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreateInspectionInput,
): Promise<InspectionRow> {
  requirePermission(ctx, "inspections", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [inspection] = await tx
      .insert(schema.inspections)
      .values({
        projectId: input.projectId,
        templateId: input.templateId,
        locationId: input.locationId,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        createdBy: userId,
      })
      .returning();
    if (!inspection) throw new Error("Failed to create inspection");

    await writeAuditLog(tx, { actorId: userId, entityType: "inspection", entityId: inspection.id, action: "create", after: inspection });
    return inspection;
  });
}

/** Peek used by routes to resolve which project an inspection belongs to before loading the full permission context. */
export async function findInspectionById(appDb: Database, userId: string, inspectionId: string): Promise<InspectionRow | undefined> {
  return withRequestContext(appDb, { userId }, async (tx) => {
    const [inspection] = await tx.select().from(schema.inspections).where(eq(schema.inspections.id, inspectionId)).limit(1);
    return inspection;
  });
}

export async function listInspections(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<InspectionRow[]> {
  requirePermission(ctx, "inspections", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.inspections).where(eq(schema.inspections.projectId, projectId));
  });
}

export async function getInspection(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  inspectionId: string,
): Promise<InspectionDetail> {
  requirePermission(ctx, "inspections", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [inspection] = await tx.select().from(schema.inspections).where(eq(schema.inspections.id, inspectionId)).limit(1);
    if (!inspection) throw new NotFoundError("Inspection not found");

    const [template] = await tx.select().from(schema.checklistTemplates).where(eq(schema.checklistTemplates.id, inspection.templateId)).limit(1);
    const responses = await tx.select().from(schema.inspectionResponses).where(eq(schema.inspectionResponses.inspectionId, inspectionId));

    return { ...inspection, templateTitle: template?.title ?? "", responses };
  });
}

export interface InspectionReportItem {
  prompt: string;
  responseType: ChecklistResponseType;
  valueLabel: string;
  generatedPunchItemNumber: string | null;
}

export interface InspectionReportData {
  projectName: string;
  templateTitle: string;
  locationName: string | null;
  performedByName: string | null;
  status: InspectionStatus;
  scheduledAt: Date | null;
  signedByName: string | null;
  signedAt: Date | null;
  items: InspectionReportItem[];
}

/** Assembles everything the PDF report (or any future report format) needs to render, in presentation order — one place that resolves the human-readable names behind every foreign key. */
export async function getInspectionReportData(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  inspectionId: string,
): Promise<InspectionReportData> {
  requirePermission(ctx, "inspections", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [inspection] = await tx.select().from(schema.inspections).where(eq(schema.inspections.id, inspectionId)).limit(1);
    if (!inspection) throw new NotFoundError("Inspection not found");

    const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, inspection.projectId)).limit(1);
    const [template] = await tx.select().from(schema.checklistTemplates).where(eq(schema.checklistTemplates.id, inspection.templateId)).limit(1);
    const [location] = inspection.locationId
      ? await tx.select().from(schema.locations).where(eq(schema.locations.id, inspection.locationId)).limit(1)
      : [undefined];
    const [performer] = inspection.performedBy
      ? await tx.select().from(schema.users).where(eq(schema.users.id, inspection.performedBy)).limit(1)
      : [undefined];

    const templateItems = await tx
      .select()
      .from(schema.checklistTemplateItems)
      .where(eq(schema.checklistTemplateItems.templateId, inspection.templateId));
    const responses = await tx.select().from(schema.inspectionResponses).where(eq(schema.inspectionResponses.inspectionId, inspectionId));
    const responseByItemId = new Map(responses.map((r) => [r.templateItemId, r]));

    const punchItemIds = responses.map((r) => r.generatedPunchItemId).filter((id): id is string => id !== null);
    const punchItems =
      punchItemIds.length > 0 ? await tx.select().from(schema.punchItems).where(inArray(schema.punchItems.id, punchItemIds)) : [];
    const punchItemById = new Map(punchItems.map((p) => [p.id, p]));

    const items: InspectionReportItem[] = templateItems
      .sort((a, b) => a.order - b.order)
      .map((templateItem) => {
        const response = responseByItemId.get(templateItem.id);
        const value = (response?.value as InspectionResponseValue | undefined) ?? null;
        const punchItem = response?.generatedPunchItemId ? punchItemById.get(response.generatedPunchItemId) : undefined;
        return {
          prompt: templateItem.prompt,
          responseType: templateItem.responseType,
          valueLabel: formatInspectionResponseValue(value),
          generatedPunchItemNumber: punchItem?.number ?? null,
        };
      });

    return {
      projectName: project?.name ?? "",
      templateTitle: template?.title ?? "",
      locationName: location?.name ?? null,
      performedByName: performer?.name ?? null,
      status: inspection.status,
      scheduledAt: inspection.scheduledAt,
      signedByName: inspection.signedByName,
      signedAt: inspection.signedAt,
      items,
    };
  });
}

export async function transitionInspectionStatus(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  inspectionId: string,
  input: TransitionInspectionStatusInput,
): Promise<InspectionRow> {
  requirePermission(ctx, "inspections", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [inspection] = await tx.select().from(schema.inspections).where(eq(schema.inspections.id, inspectionId)).limit(1);
    if (!inspection) throw new ApiError(404, "not_found", "Inspection not found");

    const allowed: readonly InspectionStatus[] = INSPECTION_STATUS_TRANSITIONS[inspection.status];
    if (!allowed.includes(input.toStatus)) {
      throw new ApiError(400, "invalid_transition", `Cannot move inspection from '${inspection.status}' to '${input.toStatus}'`);
    }
    if (input.toStatus === "completed") {
      throw new ApiError(400, "validation_error", "Use POST /inspections/:id/complete to sign off and complete an inspection");
    }

    const [updated] = await tx
      .update(schema.inspections)
      .set({
        status: input.toStatus,
        performedBy: input.toStatus === "in_progress" ? userId : inspection.performedBy,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: inspection.serverRevision + 1,
      })
      .where(eq(schema.inspections.id, inspectionId))
      .returning();
    if (!updated) throw new Error("Failed to transition inspection status");
    return updated;
  });
}

export async function updateInspectionResponses(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  inspectionId: string,
  input: UpdateInspectionResponsesInput,
): Promise<InspectionResponseRow[]> {
  requirePermission(ctx, "inspections", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [inspection] = await tx.select().from(schema.inspections).where(eq(schema.inspections.id, inspectionId)).limit(1);
    if (!inspection) throw new ApiError(404, "not_found", "Inspection not found");
    if (inspection.status === "completed") {
      throw new ApiError(400, "inspection_completed", "This inspection is already completed and can no longer be edited");
    }

    const templateItems = await tx
      .select()
      .from(schema.checklistTemplateItems)
      .where(eq(schema.checklistTemplateItems.templateId, inspection.templateId));
    const itemsById = new Map(templateItems.map((item) => [item.id, item]));

    const results: InspectionResponseRow[] = [];
    for (const response of input.responses) {
      const templateItem = itemsById.get(response.templateItemId);
      if (!templateItem) throw new ApiError(400, "validation_error", `Template item ${response.templateItemId} is not on this inspection's template`);
      if (templateItem.responseType !== response.value.type) {
        throw new ApiError(
          400,
          "validation_error",
          `Item "${templateItem.prompt}" expects a '${templateItem.responseType}' response, got '${response.value.type}'`,
        );
      }
      results.push(await applyResponse(tx, userId, inspection, templateItem, response.value));
    }

    await tx
      .update(schema.inspections)
      .set({ updatedBy: userId, updatedAt: new Date(), serverRevision: inspection.serverRevision + 1 })
      .where(eq(schema.inspections.id, inspectionId));

    return results;
  });
}

export async function completeInspection(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  inspectionId: string,
  input: CompleteInspectionInput,
): Promise<InspectionRow> {
  requirePermission(ctx, "inspections", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [inspection] = await tx.select().from(schema.inspections).where(eq(schema.inspections.id, inspectionId)).limit(1);
    if (!inspection) throw new ApiError(404, "not_found", "Inspection not found");
    if (inspection.status !== "in_progress") {
      throw new ApiError(400, "invalid_transition", `Cannot complete an inspection in status '${inspection.status}'`);
    }

    const [updated] = await tx
      .update(schema.inspections)
      .set({
        status: "completed",
        signedByName: input.signedByName,
        signedAt: new Date(),
        signatureAttachmentId: input.signatureAttachmentId,
        updatedBy: userId,
        updatedAt: new Date(),
        serverRevision: inspection.serverRevision + 1,
      })
      .where(eq(schema.inspections.id, inspectionId))
      .returning();
    if (!updated) throw new Error("Failed to complete inspection");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "inspection",
      entityId: inspectionId,
      action: "complete",
      before: { status: inspection.status },
      after: { status: "completed" },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Offline sync path (docs/ARCHITECTURE.md §6) — used by POST /sync/push, not
// the direct CRUD endpoints above.
// ---------------------------------------------------------------------------

export interface SyncApplyResult {
  status: "applied" | "conflict" | "rejected";
  serverRevision?: number;
  conflicts?: FieldConflict[];
  reason?: string;
}

interface PushedInspectionResponse {
  templateItemId: string;
  value: InspectionResponseValue;
}

async function applyPushedResponses(
  tx: Tx,
  userId: string,
  inspection: InspectionRow,
  pushedResponses: unknown,
): Promise<void> {
  if (!Array.isArray(pushedResponses)) return;
  const templateItems = await tx
    .select()
    .from(schema.checklistTemplateItems)
    .where(eq(schema.checklistTemplateItems.templateId, inspection.templateId));
  const itemsById = new Map(templateItems.map((item) => [item.id, item]));

  for (const raw of pushedResponses as PushedInspectionResponse[]) {
    const templateItem = itemsById.get(raw.templateItemId);
    if (!templateItem || templateItem.responseType !== raw.value.type) continue; // silently skip malformed/stale sub-rows rather than failing the whole record
    await applyResponse(tx, userId, inspection, templateItem, raw.value);
  }
}

export async function applyInspectionPush(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  localId: string,
  base: Record<string, unknown> | null,
  data: Record<string, unknown>,
): Promise<SyncApplyResult> {
  if (!hasPermission(ctx, "inspections", "standard")) {
    return { status: "rejected", reason: "permission_denied" };
  }

  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [existing] = await tx.select().from(schema.inspections).where(eq(schema.inspections.id, localId)).limit(1);

    if (!existing) {
      if (typeof data.templateId !== "string") return { status: "rejected", reason: "template_id_required" };
      const status = data.status === "completed" || data.status === "in_progress" ? data.status : "in_progress";

      const [inspection] = await tx
        .insert(schema.inspections)
        .values({
          id: localId,
          projectId,
          templateId: data.templateId,
          locationId: typeof data.locationId === "string" ? data.locationId : undefined,
          status,
          performedBy: userId,
          signedByName: typeof data.signedByName === "string" ? data.signedByName : undefined,
          signedAt: status === "completed" ? new Date() : undefined,
          createdBy: userId,
        })
        .returning();
      if (!inspection) return { status: "rejected", reason: "insert_failed" };

      await applyPushedResponses(tx, userId, inspection, data.responses);
      await writeAuditLog(tx, { actorId: userId, entityType: "inspection", entityId: inspection.id, action: "create", after: inspection });
      return { status: "applied", serverRevision: inspection.serverRevision };
    }

    if (existing.projectId !== projectId) {
      return { status: "rejected", reason: "not_found" };
    }
    if (existing.status === "completed") {
      return { status: "rejected", reason: "inspection_completed" };
    }

    const { merged, conflicts } = mergeFields(base, data, existing as unknown as Record<string, unknown>);

    const columnUpdates: Record<string, unknown> = {};
    if ("status" in merged) columnUpdates.status = merged.status;
    if ("signedByName" in merged) columnUpdates.signedByName = merged.signedByName;
    if (merged.status === "completed") columnUpdates.signedAt = new Date();

    const [updated] = await tx
      .update(schema.inspections)
      .set({
        ...columnUpdates,
        serverRevision: existing.serverRevision + 1,
        updatedAt: new Date(),
        updatedBy: userId,
        needsReview: conflicts.length > 0,
        conflictData: conflicts.length > 0 ? conflicts : null,
      })
      .where(eq(schema.inspections.id, localId))
      .returning();
    if (!updated) return { status: "rejected", reason: "update_failed" };

    await applyPushedResponses(tx, userId, updated, data.responses);

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "inspection",
      entityId: localId,
      action: "sync_push",
      before: existing,
      after: updated,
    });

    return {
      status: conflicts.length > 0 ? "conflict" : "applied",
      serverRevision: updated.serverRevision,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    };
  });
}

export async function listInspectionsSince(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
  sinceRevision: number,
): Promise<InspectionRow[]> {
  requirePermission(ctx, "inspections", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const rows = await tx.select().from(schema.inspections).where(eq(schema.inspections.projectId, projectId));
    return rows.filter((r) => r.serverRevision > sinceRevision);
  });
}
