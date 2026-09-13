import { z } from "zod";

export const safetyIncidentSeveritySchema = z.enum(["near_miss", "minor", "serious", "critical"]);
export type SafetyIncidentSeverity = z.infer<typeof safetyIncidentSeveritySchema>;

export const safetyIncidentStatusSchema = z.enum(["open", "investigating", "closed"]);
export type SafetyIncidentStatus = z.infer<typeof safetyIncidentStatusSchema>;

export const createSafetyIncidentSchema = z
  .object({
    projectId: z.string().uuid(),
    occurredAt: z.string().datetime(),
    locationId: z.string().uuid().optional(),
    severity: safetyIncidentSeveritySchema,
    description: z.string().min(1).max(4000),
    involvedCompanyId: z.string().uuid().optional(),
    injuredPersonName: z.string().max(200).optional(),
  })
  .strict();
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
