import { z } from "zod";
import { signatureImageBase64Schema } from "./esignature.schema";
import { paginationQuerySchema } from "./list-query.schema";

export const checklistResponseTypeSchema = z.enum(["pass_fail", "na", "numeric", "photo", "signature"]);
export type ChecklistResponseType = z.infer<typeof checklistResponseTypeSchema>;

export const createChecklistTemplateItemSchema = z
  .object({
    prompt: z.string().min(1).max(500),
    responseType: checklistResponseTypeSchema,
    order: z.number().int().min(0).default(0),
  })
  .strict();
export type CreateChecklistTemplateItemInput = z.infer<typeof createChecklistTemplateItemSchema>;

/**
 * `checklist_templates.project_id` is nullable in the schema for a global,
 * reusable template (docs/DATA_MODEL.md §8), but every template created
 * through this API is project-scoped for now — a global template has no
 * single project's permission context to authorize its creation against,
 * and this phase doesn't build the org-level-admin concept that would
 * need. Deferred, not silently dropped: see docs/ROADMAP.md's Phase 5
 * gate report.
 */
export const createChecklistTemplateSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().min(1).max(300),
    items: z.array(createChecklistTemplateItemSchema).min(1).max(100),
  })
  .strict();
export type CreateChecklistTemplateInput = z.infer<typeof createChecklistTemplateSchema>;

export const inspectionStatusSchema = z.enum(["scheduled", "in_progress", "completed"]);
export type InspectionStatus = z.infer<typeof inspectionStatusSchema>;

export const INSPECTION_SORT_KEYS = ["templateTitle", "status", "scheduledAt"] as const;
export type InspectionSortKey = (typeof INSPECTION_SORT_KEYS)[number];

/** GET /inspections's query contract (Phase 24, same shape as rfi.schema.ts's listRfisQuerySchema from Phase 21). Inspections carry no title/subject of their own -- both search and the `templateTitle` sort key operate on the joined checklist_templates.title, since that's the only human-readable label the list page has ever shown (see inspection.service.ts's listInspections). */
export const listInspectionsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(INSPECTION_SORT_KEYS).optional(),
    status: inspectionStatusSchema.optional(),
  })
  .strict();
export type ListInspectionsQuery = z.infer<typeof listInspectionsQuerySchema>;

export const createInspectionSchema = z
  .object({
    projectId: z.string().uuid(),
    templateId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    scheduledAt: z.string().datetime().optional(),
  })
  .strict();
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;

/** One tagged-union shape per response type, matching `checklist_response_type` — the checklist item's own `responseType` says which shape a given response must use (validated server-side against the template item, not just against this schema). */
export const inspectionResponseValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pass_fail"), passed: z.boolean() }).strict(),
  z.object({ type: z.literal("na") }).strict(),
  z.object({ type: z.literal("numeric"), number: z.number() }).strict(),
  z.object({ type: z.literal("photo"), attachmentId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("signature"), signedByName: z.string().min(1).max(200) }).strict(),
]);
export type InspectionResponseValue = z.infer<typeof inspectionResponseValueSchema>;

export const submitInspectionResponseSchema = z
  .object({
    templateItemId: z.string().uuid(),
    value: inspectionResponseValueSchema,
  })
  .strict();
export type SubmitInspectionResponseInput = z.infer<typeof submitInspectionResponseSchema>;

export const updateInspectionResponsesSchema = z
  .object({
    responses: z.array(submitInspectionResponseSchema).min(1).max(200),
  })
  .strict();
export type UpdateInspectionResponsesInput = z.infer<typeof updateInspectionResponsesSchema>;

export const transitionInspectionStatusSchema = z
  .object({
    toStatus: inspectionStatusSchema,
  })
  .strict();
export type TransitionInspectionStatusInput = z.infer<typeof transitionInspectionStatusSchema>;

export const INSPECTION_STATUS_TRANSITIONS: Record<InspectionStatus, readonly InspectionStatus[]> = {
  scheduled: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
};

/**
 * Completing an inspection signs it off. `signedByName` (typed name) is
 * always required — it's what the PDF report actually renders.
 * `signatureAttachmentId` accepts a drawn signature image for forward
 * compatibility, but no client produces one yet (docs/ROADMAP.md's Phase
 * 5 gate report), so the report never embeds it.
 */
export const completeInspectionSchema = z
  .object({
    signedByName: z.string().min(1).max(200),
    signatureAttachmentId: z.string().uuid().optional(),
    signatureImageBase64: signatureImageBase64Schema,
  })
  .strict();
export type CompleteInspectionInput = z.infer<typeof completeInspectionSchema>;

/** One place both the PDF report and any future UI list/detail view render a response value from — avoids re-deriving "what does this response mean" per surface. */
export function formatInspectionResponseValue(value: InspectionResponseValue | null | undefined): string {
  if (!value) return "—";
  switch (value.type) {
    case "pass_fail":
      return value.passed ? "Pass" : "Fail";
    case "na":
      return "N/A";
    case "numeric":
      return String(value.number);
    case "photo":
      return "Photo attached";
    case "signature":
      return `Signed: ${value.signedByName}`;
  }
}
