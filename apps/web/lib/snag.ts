import { apiJson } from "./api-client";
import { uploadAttachment } from "./upload";

export interface NewSnag {
  projectId: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  locationId?: string;
  tradeId?: string;
  assigneeUserId?: string;
  assigneeCompanyId?: string;
  finalApproverUserId?: string;
  distributionUserIds: string[];
}

/**
 * Creates a punch item and uploads its photos. One function so the offline write queue (plan D2) can wrap exactly this
 * unit of work. Photos are uploaded after the record exists; a failed photo upload does not lose the record and is
 * reported to the caller via `failedPhotos` so it can be retried.
 */
export async function createSnag(snag: NewSnag, photos: File[]): Promise<{ id: string; number: string; failedPhotos: File[] }> {
  const item = await apiJson<{ id: string; number: string }>("/punch-items", { method: "POST", body: JSON.stringify(snag) });
  const failedPhotos: File[] = [];
  for (const file of photos) {
    try {
      await uploadAttachment({ projectId: snag.projectId, ownerType: "punch_item", ownerId: item.id, file });
    } catch {
      failedPhotos.push(file);
    }
  }
  return { id: item.id, number: item.number, failedPhotos };
}
