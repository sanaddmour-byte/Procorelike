import { z } from "zod";

export const scheduleTaskStatusSchema = z.enum(["not_started", "in_progress", "complete", "delayed"]);
export type ScheduleTaskStatus = z.infer<typeof scheduleTaskStatusSchema>;

export const createScheduleTaskSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(300),
    description: z.string().max(2000).optional(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    assignedCompanyId: z.string().uuid().optional(),
    sortOrder: z.number().int().default(0),
  })
  .strict()
  .refine((v) => v.endDate >= v.startDate, { message: "endDate must be on or after startDate", path: ["endDate"] });
export type CreateScheduleTaskInput = z.infer<typeof createScheduleTaskSchema>;

export const updateScheduleTaskSchema = z
  .object({
    name: z.string().min(1).max(300).optional(),
    description: z.string().max(2000).optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    assignedCompanyId: z.string().uuid().optional(),
    sortOrder: z.number().int().optional(),
    percentComplete: z.number().int().min(0).max(100).optional(),
  })
  .strict();
export type UpdateScheduleTaskInput = z.infer<typeof updateScheduleTaskSchema>;

export const transitionScheduleTaskStatusSchema = z
  .object({
    toStatus: scheduleTaskStatusSchema,
  })
  .strict();
export type TransitionScheduleTaskStatusInput = z.infer<typeof transitionScheduleTaskStatusSchema>;

/**
 * Any status can move to any other -- unlike a punch item or RFI, a
 * schedule task's status is a manual signal of where things stand, not a
 * strict approval workflow, so "delayed" needs to reach every other
 * state directly (e.g. a delayed task un-delaying back to in_progress)
 * rather than being modeled as a linear chain.
 */
export const SCHEDULE_TASK_STATUS_TRANSITIONS: Record<ScheduleTaskStatus, readonly ScheduleTaskStatus[]> = {
  not_started: ["in_progress", "delayed"],
  in_progress: ["complete", "delayed", "not_started"],
  delayed: ["in_progress", "not_started"],
  complete: ["in_progress"],
};
