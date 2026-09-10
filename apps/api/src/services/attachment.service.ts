import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { schema, withRequestContext, type Database } from "@siteops/db";
import { requirePermission, type ConfirmUploadInput, type PermissionContext, type RequestUploadInput } from "@siteops/shared";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../env";
import { writeAuditLog } from "../lib/audit";

const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface AttachmentDeps {
  appDb: Database;
  s3: S3Client;
  env: Env;
}

/**
 * Pre-signed upload flow (docs/ARCHITECTURE.md §5): the client asks for a
 * scoped, short-lived upload URL, uploads directly to storage, then confirms
 * so the API can record the attachments row. The permission check happens
 * here, before issuing the URL — not after the file is already uploaded.
 */
export async function requestUploadUrl(
  deps: AttachmentDeps,
  _userId: string,
  ctx: PermissionContext,
  input: RequestUploadInput,
): Promise<{ uploadUrl: string; storageKey: string; expiresInSeconds: number }> {
  requirePermission(ctx, "documents", "standard");

  const storageKey = `${input.projectId}/${input.ownerType}/${randomUUID()}-${input.filename}`;
  const command = new PutObjectCommand({
    Bucket: deps.env.S3_BUCKET,
    Key: storageKey,
    ContentType: input.mime,
  });
  const uploadUrl = await getSignedUrl(deps.s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

  return { uploadUrl, storageKey, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
}

export async function confirmUpload(
  deps: AttachmentDeps,
  userId: string,
  ctx: PermissionContext,
  input: ConfirmUploadInput,
): Promise<typeof schema.attachments.$inferSelect> {
  requirePermission(ctx, "documents", "standard");

  return withRequestContext(deps.appDb, { userId, role: ctx.role }, async (tx) => {
    const [attachment] = await tx
      .insert(schema.attachments)
      .values({
        projectId: input.projectId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        storageKey: input.storageKey,
        filename: input.filename,
        mime: input.mime,
        size: input.size,
        uploadedBy: userId,
      })
      .returning();
    if (!attachment) throw new Error("Failed to record attachment");

    await writeAuditLog(tx, {
      actorId: userId,
      entityType: "attachment",
      entityId: attachment.id,
      action: "create",
      after: attachment,
    });

    return attachment;
  });
}
