import { z } from "zod";

export const requestUploadSchema = z
  .object({
    projectId: z.string().uuid(),
    ownerType: z.string().min(1).max(50),
    ownerId: z.string().uuid(),
    filename: z.string().min(1).max(500),
    mime: z.string().min(1).max(200),
    size: z.number().int().positive().max(2 * 1024 * 1024 * 1024), // 2GB cap
  })
  .strict();
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export const confirmUploadSchema = requestUploadSchema.extend({
  storageKey: z.string().min(1),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
