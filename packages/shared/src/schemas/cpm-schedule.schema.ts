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
