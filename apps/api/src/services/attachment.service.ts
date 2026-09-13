import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { schema, withRequestContext, type Database } from "@siteops/db";
import {
  requirePermission,
  type ConfirmUploadInput,
  type Module,
  type PermissionContext,
  type RequestUploadInput,
} from "@siteops/shared";
import type { S3Client } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { ApiError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";
import { withUserContext } from "./permission.service";

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

type AttachmentRow = typeof schema.attachments.$inferSelect;

export interface AttachmentDeps {
  appDb: Database;
  s3: S3Client;
  env: Env;
}

/**
 * An attachment's owner determines which module's write permission governs
 * it — a photo-only role must be able to upload photos without also having
 * `documents` access, and a drawing-revision upload needs `drawings`, not
 * `documents`. Add an entry here whenever a new entity starts attaching
 * files.
 */
const OWNER_TYPE_MODULES: Record<string, Module> = {
  photo: "photos",
  document: "documents",
  drawing_revision: "drawings",
  submittal_revision: "submittals",
  inspection: "inspections",
  tm_ticket: "tm_tickets",
  correspondence: "correspondence",
};

function moduleForOwnerType(ownerType: string): Module {
  const module = OWNER_TYPE_MODULES[ownerType];
  if (!module) throw new ApiError(400, "validation_error", `Unknown attachment ownerType: ${ownerType}`);
  return module;
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
  requirePermission(ctx, moduleForOwnerType(input.ownerType), "standard");

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
  requirePermission(ctx, moduleForOwnerType(input.ownerType), "standard");

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

/** Peek used by the download route to resolve an attachment's project/owner before loading the full permission context — see permission.service.ts's withUserContext doc comment. */
export async function findAttachmentById(appDb: Database, userId: string, attachmentId: string): Promise<AttachmentRow | undefined> {
  return withUserContext(appDb, userId, async (tx) => {
    const [attachment] = await tx.select().from(schema.attachments).where(eq(schema.attachments.id, attachmentId)).limit(1);
    return attachment;
  });
}

/**
 * Downloads mirror the upload flow (docs/ARCHITECTURE.md §5): a short-lived
 * pre-signed GET URL, issued only after a read-permission check on the
 * module that owns this attachment — never proxied through the API
 * process.
 */
export async function getDownloadUrl(
  deps: AttachmentDeps,
  ctx: PermissionContext,
  attachment: AttachmentRow,
): Promise<{ downloadUrl: string; filename: string; mime: string; expiresInSeconds: number }> {
  requirePermission(ctx, moduleForOwnerType(attachment.ownerType), "read");

  const command = new GetObjectCommand({ Bucket: deps.env.S3_BUCKET, Key: attachment.storageKey });
  const downloadUrl = await getSignedUrl(deps.s3, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });

  return { downloadUrl, filename: attachment.filename, mime: attachment.mime, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
}
