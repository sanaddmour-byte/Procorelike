import { z } from "zod";
import { isModule } from "../constants/modules";

export const createSavedViewSchema = z
  .object({
    projectId: z.string().uuid(),
    module: z.string().refine(isModule, { message: "Unknown module" }),
    name: z.string().min(1).max(200),
    filters: z.record(z.string(), z.unknown()),
  })
  .strict();
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;
