import { apiJson } from "../api-client";
import { listUploadablePunchPhotos, markPunchPhotoUploaded } from "../db/punch-item-repo";

interface PresignResponse {
  uploadUrl: string;
  storageKey: string;
}

/**
 * Uploads snag photos taken with no connection, once the punch item they belong to exists on the server. Presign → PUT →
 * confirm, the same pattern as the web app (docs/ARCHITECTURE.md §5). A failed upload leaves the photo queued for the
 * next sync instead of dropping it.
 */
export async function uploadPendingPunchPhotos(projectId: string): Promise<void> {
  const photos = await listUploadablePunchPhotos(projectId);
  for (const photo of photos) {
    try {
      const blob = await (await fetch(photo.uri)).blob();
      const presign = await apiJson<PresignResponse>("/attachments/presign", {
        method: "POST",
        body: JSON.stringify({ projectId, ownerType: "punch_item", ownerId: photo.punchItemId, filename: photo.filename, mime: photo.mime, size: blob.size }),
      });
      const put = await fetch(presign.uploadUrl, { method: "PUT", headers: { "content-type": photo.mime }, body: blob });
      if (!put.ok) continue;
      await apiJson("/attachments/confirm", {
        method: "POST",
        body: JSON.stringify({ projectId, ownerType: "punch_item", ownerId: photo.punchItemId, storageKey: presign.storageKey, filename: photo.filename, mime: photo.mime, size: blob.size }),
      });
      await markPunchPhotoUploaded(photo.id);
    } catch {
      // Still offline or the file service is unavailable: keep the photo and retry on the next sync.
    }
  }
}
