import { z } from "zod";

export const dailyLogManpowerSchema = z
  .object({
    companyId: z.string().uuid(),
    tradeId: z.string().uuid(),
    headcount: z.number().int().nonnegative(),
    hours: z.number().nonnegative(),
  })
  .strict();

export const dailyLogEquipmentSchema = z
  .object({
    equipmentDesc: z.string().min(1).max(300),
    companyId: z.string().uuid().optional(),
    hours: z.number().nonnegative().optional(),
  })
  .strict();

export const dailyLogDeliverySchema = z
  .object({
    entryType: z.enum(["delivery", "visitor"]).default("delivery"),
    description: z.string().min(1),
    receivedBy: z.string().max(200).optional(),
  })
  .strict();

export const dailyLogDelaySchema = z
  .object({
    causeCode: z.string().min(1).max(100),
    description: z.string().min(1),
    hoursImpact: z.number().optional(),
    /** Addendum A6 "delay linkage" (Phase 11c) -- optional link to a CPM schedule task, so a delay register can aggregate impact per activity. */
    scheduleTaskId: z.string().uuid().optional(),
  })
  .strict();

export const createDailyLogSchema = z
  .object({
    projectId: z.string().uuid(),
    logDate: z.string().date(),
    notes: z.string().max(5000).optional(),
    weatherJson: z.record(z.string(), z.unknown()).optional(),
    manpower: z.array(dailyLogManpowerSchema).default([]),
    equipment: z.array(dailyLogEquipmentSchema).default([]),
    deliveries: z.array(dailyLogDeliverySchema).default([]),
    delays: z.array(dailyLogDelaySchema).default([]),
  })
  .strict();
export type CreateDailyLogInput = z.infer<typeof createDailyLogSchema>;

export const updateDailyLogSchema = createDailyLogSchema
  .omit({ projectId: true, logDate: true })
  .partial()
  .extend({
    /** Submits/locks the log — no further edits without an explicit reopen. */
    locked: z.boolean().optional(),
  })
  .strict();
export type UpdateDailyLogInput = z.infer<typeof updateDailyLogSchema>;
