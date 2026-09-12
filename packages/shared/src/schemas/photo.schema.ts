import { z } from "zod";

export const createPhotoAlbumSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200),
  })
  .strict();
export type CreatePhotoAlbumInput = z.infer<typeof createPhotoAlbumSchema>;

export const createPhotoSchema = z
  .object({
    projectId: z.string().uuid(),
    albumId: z.string().uuid().optional(),
    attachmentId: z.string().uuid(),
    takenAt: z.string().datetime().optional(),
    gpsLat: z.number().min(-90).max(90).optional(),
    gpsLng: z.number().min(-180).max(180).optional(),
    tags: z.array(z.string().max(50)).max(20).default([]),
  })
  .strict();
export type CreatePhotoInput = z.infer<typeof createPhotoSchema>;
