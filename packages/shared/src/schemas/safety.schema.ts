import { z } from "zod";
import { paginationQuerySchema } from "./list-query.schema";

export const safetyIncidentSeveritySchema = z.enum(["near_miss", "minor", "serious", "critical"]);
export type SafetyIncidentSeverity = z.infer<typeof safetyIncidentSeveritySchema>;

export const safetyIncidentStatusSchema = z.enum(["open", "investigating", "closed"]);
export type SafetyIncidentStatus = z.infer<typeof safetyIncidentStatusSchema>;

export const SAFETY_INCIDENT_SORT_KEYS = ["description", "occurredAt", "severity", "status"] as const;
export type SafetyIncidentSortKey = (typeof SAFETY_INCIDENT_SORT_KEYS)[number];

/** GET /safety-incidents's query contract (Phase 24, same shape as rfi.schema.ts's listRfisQuerySchema from Phase 21). No `company` sort key -- the list page's Involved Company column is rendered from a joined lookup (see docs/DATA_MODEL.md §9n's note on Commitments/T&M Tickets), not a plain column, and sorting/searching by it isn't supported here either. Safety Observations are explicitly out of scope this phase (same documented scope cut as Change Events in Phase 22). */
export const listSafetyIncidentsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(SAFETY_INCIDENT_SORT_KEYS).optional(),
    status: safetyIncidentStatusSchema.optional(),
  })
  .strict();
export type ListSafetyIncidentsQuery = z.infer<typeof listSafetyIncidentsQuerySchema>;

export const oshaClassificationSchema = z.enum([
  "not_recordable",
  "death",
  "days_away_from_work",
  "job_transfer_or_restriction",
  "other_recordable",
]);
export type OshaClassification = z.infer<typeof oshaClassificationSchema>;

export const injuryIllnessTypeSchema = z.enum([
  "injury",
  "skin_disorder",
  "respiratory_condition",
  "poisoning",
  "hearing_loss",
  "other_illness",
]);
export type InjuryIllnessType = z.infer<typeof injuryIllnessTypeSchema>;

export const createSafetyIncidentSchema = z
  .object({
    projectId: z.string().uuid(),
    occurredAt: z.string().datetime(),
    locationId: z.string().uuid().optional(),
    severity: safetyIncidentSeveritySchema,
    description: z.string().min(1).max(4000),
    involvedCompanyId: z.string().uuid().optional(),
    injuredPersonName: z.string().max(200).optional(),
    oshaClassification: oshaClassificationSchema.optional(),
    injuryIllnessType: injuryIllnessTypeSchema.optional(),
    bodyPart: z.string().max(200).optional(),
    daysAwayFromWork: z.number().int().min(0).optional(),
    daysJobTransferOrRestriction: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((data) => (data.oshaClassification ?? "not_recordable") !== "not_recordable" || !data.injuryIllnessType, {
    message: "injuryIllnessType only applies to a recordable case",
    path: ["injuryIllnessType"],
  });
export type CreateSafetyIncidentInput = z.infer<typeof createSafetyIncidentSchema>;

export const transitionSafetyIncidentStatusSchema = z
  .object({
    toStatus: safetyIncidentStatusSchema,
    /** Required when transitioning to "closed" -- enforced in the service, not just here, since it depends on the target status. */
    correctiveAction: z.string().max(4000).optional(),
  })
  .strict();
export type TransitionSafetyIncidentStatusInput = z.infer<typeof transitionSafetyIncidentStatusSchema>;

/** A closed incident can reopen (e.g. the corrective action didn't hold) -- not modeled as a dead end. */
export const SAFETY_INCIDENT_STATUS_TRANSITIONS: Record<SafetyIncidentStatus, readonly SafetyIncidentStatus[]> = {
  open: ["investigating", "closed"],
  investigating: ["closed", "open"],
  closed: ["open"],
};

export const safetyObservationCategorySchema = z.enum(["unsafe_condition", "unsafe_act", "near_miss", "good_catch"]);
export type SafetyObservationCategory = z.infer<typeof safetyObservationCategorySchema>;

export const safetyObservationStatusSchema = z.enum(["open", "resolved"]);
export type SafetyObservationStatus = z.infer<typeof safetyObservationStatusSchema>;

export const createSafetyObservationSchema = z
  .object({
    projectId: z.string().uuid(),
    observedAt: z.string().datetime(),
    locationId: z.string().uuid().optional(),
    category: safetyObservationCategorySchema,
    description: z.string().min(1).max(4000),
  })
  .strict();
export type CreateSafetyObservationInput = z.infer<typeof createSafetyObservationSchema>;

export const SAFETY_OBSERVATION_STATUS_TRANSITIONS: Record<SafetyObservationStatus, readonly SafetyObservationStatus[]> = {
  open: ["resolved"],
  resolved: ["open"],
};
