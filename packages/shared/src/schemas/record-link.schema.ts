import { z } from "zod";

export const createRecordLinkSchema = z
  .object({
    projectId: z.string().uuid(),
    sourceType: z.string().min(1).max(100),
    sourceId: z.string().uuid(),
    targetType: z.string().min(1).max(100),
    targetId: z.string().uuid(),
  })
  .strict();
export type CreateRecordLinkInput = z.infer<typeof createRecordLinkSchema>;
