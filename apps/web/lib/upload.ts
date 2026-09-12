import { apiJson } from "./api-client";

interface PresignResponse {
  uploadUrl: string;
  storageKey: string;
}

interface AttachmentRecord {
  id: string;
}

/** Presign → PUT → confirm, the pattern behind every file upload in the app (docs/ARCHITECTURE.md §5). Returns the recorded attachment's id. */
export async function uploadAttachment(params: {
  projectId: string;
  ownerType: string;
  ownerId: string;
  file: File;
}): Promise<string> {
  const { projectId, ownerType, ownerId, file } = params;
  const mime = file.type || "application/octet-stream";

  const presign = await apiJson<PresignResponse>("/attachments/presign", {
    method: "POST",
    body: JSON.stringify({ projectId, ownerType, ownerId, filename: file.name, mime, size: file.size }),
  });

  const uploadRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "content-type": mime },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("upload_failed");

  const attachment = await apiJson<AttachmentRecord>("/attachments/confirm", {
    method: "POST",
    body: JSON.stringify({ projectId, ownerType, ownerId, storageKey: presign.storageKey, filename: file.name, mime, size: file.size }),
  });
  return attachment.id;
}
