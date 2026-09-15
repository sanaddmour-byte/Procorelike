import { schema, type Tx } from "@siteops/db";
import { computeContentHash } from "@siteops/shared/server";
import type { EsignatureDocumentType, EsignatureVerification } from "@siteops/shared";
import { and, desc, eq } from "drizzle-orm";

type EsignatureRow = typeof schema.esignatures.$inferSelect;

export interface RecordSignatureInput {
  projectId: string;
  documentType: EsignatureDocumentType;
  documentId: string;
  signerUserId: string;
  signerName: string;
  signatureImageBase64?: string;
  /** The frozen snapshot of exactly what was signed -- hashed, never stored raw here (the document itself is the source of truth for its own content). */
  content: unknown;
}

/**
 * Records a real, verifiable e-signature: a sha256 fingerprint of the exact
 * content the signer saw, plus an optional drawn signature image and the
 * signer's identity -- called inside the same transaction as the
 * status/completion change it certifies (correspondence's draft->sent,
 * inspection's complete), so the two can never drift apart. See
 * business-rules/esignature.ts for why hashing beats trusting a typed name
 * alone.
 */
export async function recordSignature(tx: Tx, input: RecordSignatureInput): Promise<EsignatureRow> {
  const contentHash = computeContentHash(input.content);
  const [row] = await tx
    .insert(schema.esignatures)
    .values({
      projectId: input.projectId,
      documentType: input.documentType,
      documentId: input.documentId,
      signerUserId: input.signerUserId,
      signerName: input.signerName,
      signatureImageBase64: input.signatureImageBase64,
      contentHash,
    })
    .returning();
  if (!row) throw new Error("Failed to record signature");
  return row;
}

/** Most recent signature for a document -- a document can be (re-)signed more than once (e.g. correspondence's closed -> sent reopen-and-resend), and only the latest is what's currently in force. */
export async function getLatestSignature(
  tx: Tx,
  documentType: EsignatureDocumentType,
  documentId: string,
): Promise<EsignatureRow | undefined> {
  const [row] = await tx
    .select()
    .from(schema.esignatures)
    .where(and(eq(schema.esignatures.documentType, documentType), eq(schema.esignatures.documentId, documentId)))
    .orderBy(desc(schema.esignatures.signedAt))
    .limit(1);
  return row;
}

/** Recomputes the hash from the document's *current* content and compares it against what was stored at signing time -- the actual "verify" step, not just a display of stored metadata. */
export function verifySignature(row: EsignatureRow | undefined, currentContent: unknown): EsignatureVerification {
  if (!row) {
    return { signed: false, signerName: null, signedAt: null, hasImage: false, verified: null, contentHash: null };
  }
  return {
    signed: true,
    signerName: row.signerName,
    signedAt: row.signedAt.toISOString(),
    hasImage: Boolean(row.signatureImageBase64),
    verified: computeContentHash(currentContent) === row.contentHash,
    contentHash: row.contentHash,
  };
}
