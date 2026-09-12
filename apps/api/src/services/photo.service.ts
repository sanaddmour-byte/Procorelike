import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type CreatePhotoAlbumInput, type CreatePhotoInput, type PermissionContext } from "@siteops/shared";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "../lib/audit";

export async function createPhotoAlbum(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreatePhotoAlbumInput,
): Promise<typeof schema.photoAlbums.$inferSelect> {
  requirePermission(ctx, "photos", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [album] = await tx.insert(schema.photoAlbums).values(input).returning();
    if (!album) throw new Error("Failed to create photo album");
    return album;
  });
}

export async function listPhotoAlbums(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<(typeof schema.photoAlbums.$inferSelect)[]> {
  requirePermission(ctx, "photos", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.photoAlbums).where(eq(schema.photoAlbums.projectId, projectId));
  });
}

/**
 * Photos are create-only over sync (docs/ROADMAP.md Phase 2 gate report) —
 * a captured photo's metadata isn't collaboratively edited the way a daily
 * log's notes or a punch item's status are, so there's no merge/conflict
 * path here, just an idempotent-by-attachment create.
 */
export async function createPhoto(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  input: CreatePhotoInput,
): Promise<typeof schema.photos.$inferSelect> {
  requirePermission(ctx, "photos", "standard");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    const [photo] = await tx
      .insert(schema.photos)
      .values({
        ...input,
        gpsLat: input.gpsLat?.toString(),
        gpsLng: input.gpsLng?.toString(),
        takenAt: input.takenAt ? new Date(input.takenAt) : undefined,
        uploadedBy: userId,
      })
      .returning();
    if (!photo) throw new Error("Failed to create photo");

    await writeAuditLog(tx, { actorId: userId, entityType: "photo", entityId: photo.id, action: "create", after: photo });
    return photo;
  });
}

export async function listPhotos(
  appDb: Database,
  userId: string,
  ctx: PermissionContext,
  projectId: string,
): Promise<(typeof schema.photos.$inferSelect)[]> {
  requirePermission(ctx, "photos", "read");
  return withRequestContext(appDb, { userId, role: ctx.role }, async (tx) => {
    return tx.select().from(schema.photos).where(eq(schema.photos.projectId, projectId));
  });
}
