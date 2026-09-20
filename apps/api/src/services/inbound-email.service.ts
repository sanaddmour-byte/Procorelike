import { randomUUID } from "node:crypto";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { nextSequenceNumber, schema, withRequestContext, type Database } from "@siteops/db";
import {
  PermissionDeniedError,
  extractInboundToken,
  extractSenderAddress,
  formatCorrespondenceNumber,
  requirePermission,
  type InboundEmailWebhookInput,
} from "@siteops/shared";
import { and, eq } from "drizzle-orm";
import type { Env } from "../env";
import { writeAuditLog } from "../lib/audit";
import { loadPermissionContext } from "./permission.service";

export interface InboundEmailDeps {
  authDb: Database;
  appDb: Database;
  s3: S3Client;
  env: Env;
}

export type InboundEmailRejectionReason =
  | "unknown_project"
  | "unknown_sender"
  | "insufficient_permission"
  | "no_project_company";

export type InboundEmailResult = { matched: true; correspondenceId: string } | { matched: false; reason: InboundEmailRejectionReason };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Phase 19's email-to-project logging: a registered project member CCs or
 * forwards a message to their project's unique `<token>@INBOUND_EMAIL_DOMAIN`
 * alias, and it lands here (via a mail provider's inbound webhook,
 * translated to InboundEmailWebhookInput at the deployment/config layer --
 * see the schema's doc comment) as an ordinary "incoming" Correspondence
 * entry with the same permission gate (`correspondence:standard`) manual
 * creation uses, so email doesn't become a side door around it.
 *
 * The project lookup by token and the sender lookup by email both run
 * against `authDb`, bypassing RLS -- this webhook has no session to derive
 * one from, the same "genuinely pre-authentication" case
 * login-by-email/invite-token/refresh-token already are (see CLAUDE.md §5).
 * Once a real project member is identified, everything else runs through
 * `appDb` under that member's own RLS context, exactly like an
 * authenticated request from them would.
 */
export async function logInboundEmail(deps: InboundEmailDeps, payload: InboundEmailWebhookInput): Promise<InboundEmailResult> {
  const token = extractInboundToken(payload.to, deps.env.INBOUND_EMAIL_DOMAIN);
  if (!token || !UUID_PATTERN.test(token)) return { matched: false, reason: "unknown_project" };

  const [project] = await deps.authDb
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.inboundEmailToken, token))
    .limit(1);
  if (!project) return { matched: false, reason: "unknown_project" };

  const senderEmail = extractSenderAddress(payload.from);
  if (!senderEmail) return { matched: false, reason: "unknown_sender" };

  const [sender] = await deps.authDb.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, senderEmail)).limit(1);
  if (!sender) return { matched: false, reason: "unknown_sender" };

  let ctx;
  try {
    ctx = await loadPermissionContext(deps.appDb, sender.id, project.id);
  } catch {
    return { matched: false, reason: "unknown_sender" };
  }

  try {
    requirePermission(ctx, "correspondence", "standard");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return { matched: false, reason: "insufficient_permission" };
    throw err;
  }

  return withRequestContext(deps.appDb, { userId: sender.id, role: ctx.role }, async (tx) => {
    const [membership] = await tx
      .select({ companyId: schema.projectUsers.companyId })
      .from(schema.projectUsers)
      .where(and(eq(schema.projectUsers.projectId, project.id), eq(schema.projectUsers.userId, sender.id)))
      .limit(1);
    if (!membership) return { matched: false, reason: "unknown_sender" };

    const [gcCompany] = await tx
      .select({ id: schema.companies.id })
      .from(schema.projectCompanies)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.projectCompanies.companyId))
      .where(and(eq(schema.projectCompanies.projectId, project.id), eq(schema.companies.type, "gc")))
      .limit(1);
    if (!gcCompany) return { matched: false, reason: "no_project_company" };

    const seq = await nextSequenceNumber(tx, project.id, "COR");
    const [correspondence] = await tx
      .insert(schema.correspondence)
      .values({
        projectId: project.id,
        correspondenceNumber: formatCorrespondenceNumber(seq),
        direction: "incoming",
        type: "letter",
        subject: payload.subject.trim().length > 0 ? payload.subject.trim() : "(no subject)",
        body: payload.text,
        fromCompanyId: membership.companyId,
        toCompanyId: gcCompany.id,
        createdBy: sender.id,
      })
      .returning();
    if (!correspondence) throw new Error("Failed to log inbound email as correspondence");

    await writeAuditLog(tx, {
      actorId: sender.id,
      entityType: "correspondence",
      entityId: correspondence.id,
      action: "create",
      after: correspondence,
    });

    for (const attachment of payload.attachments) {
      const buffer = Buffer.from(attachment.contentBase64, "base64");
      const storageKey = `${project.id}/correspondence/${randomUUID()}-${attachment.filename}`;
      await deps.s3.send(
        new PutObjectCommand({ Bucket: deps.env.S3_BUCKET, Key: storageKey, Body: buffer, ContentType: attachment.contentType }),
      );

      const [attachmentRow] = await tx
        .insert(schema.attachments)
        .values({
          projectId: project.id,
          ownerType: "correspondence",
          ownerId: correspondence.id,
          storageKey,
          filename: attachment.filename,
          mime: attachment.contentType,
          size: buffer.length,
          uploadedBy: sender.id,
        })
        .returning();
      if (attachmentRow) {
        await writeAuditLog(tx, { actorId: sender.id, entityType: "attachment", entityId: attachmentRow.id, action: "create", after: attachmentRow });
      }
    }

    return { matched: true, correspondenceId: correspondence.id };
  });
}
