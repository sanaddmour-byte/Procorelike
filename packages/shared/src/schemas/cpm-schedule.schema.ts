import { z } from "zod";

export const scheduleSourceToolSchema = z.enum(["ms_project_xml", "p6_xer", "p6_xml", "csv"]);

export const importScheduleSchema = z
  .object({
    projectId: z.string().uuid(),
    sourceTool: scheduleSourceToolSchema,
    fileText: z.string().min(1),
    columnMapping: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type ImportScheduleApiInput = z.infer<typeof importScheduleSchema>;

// -- Addendum A6, Phase 11c: look-ahead, constraint log, PPC, progress capture --

export const scheduleConstraintCategorySchema = z.enum([
  "design",
  "material",
  "permit",
  "access",
  "labour",
  "prerequisite",
  "other",
]);

export const createScheduleConstraintSchema = z
  .object({
    taskId: z.string().uuid(),
    category: scheduleConstraintCategorySchema,
    description: z.string().min(1).max(2000),
    ownerCompanyId: z.string().uuid().optional(),
    needByDate: z.string().date(),
  })
  .strict();
export type CreateScheduleConstraintInput = z.infer<typeof createScheduleConstraintSchema>;

export const createLookaheadPlanSchema = z
  .object({
    projectId: z.string().uuid(),
    weekStart: z.string().date(),
    horizonWeeks: z.number().int().min(1).max(12).default(3),
  })
  .strict();
export type CreateLookaheadPlanInput = z.infer<typeof createLookaheadPlanSchema>;

export const createLookaheadCommitmentSchema = z
  .object({
    lookaheadPlanId: z.string().uuid(),
    taskId: z.string().uuid(),
    promisedFinish: z.string().date(),
    committedByCompanyId: z.string().uuid(),
  })
  .strict();
export type CreateLookaheadCommitmentInput = z.infer<typeof createLookaheadCommitmentSchema>;

export const lookaheadCommitmentConfirmationSchema = z.enum(["confirmed", "declined"]);

export const recordCommitmentActualSchema = z
  .object({
    actualFinish: z.string().date(),
    reasonCode: z.string().max(100).optional(),
  })
  .strict();
export type RecordCommitmentActualInput = z.infer<typeof recordCommitmentActualSchema>;

export const submitScheduleProgressUpdateSchema = z
  .object({
    taskId: z.string().uuid(),
    proposedPercentComplete: z.number().int().min(0).max(100).optional(),
    proposedActualStart: z.string().datetime().optional(),
    proposedActualFinish: z.string().datetime().optional(),
    note: z.string().max(2000).optional(),
    photoAttachmentId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (v) => v.proposedPercentComplete !== undefined || v.proposedActualStart !== undefined || v.proposedActualFinish !== undefined,
    { message: "At least one of proposedPercentComplete, proposedActualStart, proposedActualFinish is required" },
  );
export type SubmitScheduleProgressUpdateInput = z.infer<typeof submitScheduleProgressUpdateSchema>;

export const rejectScheduleProgressUpdateSchema = z
  .object({
    rejectionReason: z.string().min(1).max(2000),
  })
  .strict();
export type RejectScheduleProgressUpdateInput = z.infer<typeof rejectScheduleProgressUpdateSchema>;

// -- Phase 11d (Addendum A, Tier B): feature-flagged native CPM editing --

export const taskConstraintTypeSchema = z.enum(["asap", "alap", "snet", "snlt", "fnet", "fnlt", "mso", "mfo"]);
export const taskDependencyTypeSchema = z.enum(["FS", "SS", "FF", "SF"]);

export const setNativeEditingEnabledSchema = z.object({ enabled: z.boolean() }).strict();
export type SetNativeEditingEnabledInput = z.infer<typeof setNativeEditingEnabledSchema>;

/** One task's proposed field changes -- used both by the persisting `recompute` endpoint and the non-persisting `preview` endpoint, so a drag's impact can be shown before it's committed. */
export const taskEditSchema = z
  .object({
    taskId: z.string().uuid(),
    name: z.string().min(1).max(500).optional(),
    durationMinutes: z.number().int().min(0).optional(),
    constraintType: taskConstraintTypeSchema.nullable().optional(),
    constraintDate: z.string().datetime().nullable().optional(),
    percentComplete: z.number().int().min(0).max(100).optional(),
  })
  .strict();
export type TaskEditInput = z.infer<typeof taskEditSchema>;

export const dependencyAddSchema = z
  .object({
    predecessorId: z.string().uuid(),
    successorId: z.string().uuid(),
    type: taskDependencyTypeSchema.default("FS"),
    lagMinutes: z.number().int().default(0),
  })
  .strict();
export type DependencyAddInput = z.infer<typeof dependencyAddSchema>;

export const scheduleEditBatchSchema = z
  .object({
    taskEdits: z.array(taskEditSchema).default([]),
    dependencyAdds: z.array(dependencyAddSchema).default([]),
    dependencyRemoveIds: z.array(z.string().uuid()).default([]),
  })
  .strict();
export type ScheduleEditBatchInput = z.infer<typeof scheduleEditBatchSchema>;
