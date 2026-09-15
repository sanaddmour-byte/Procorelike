import { z } from "zod";

export const esignatureDocumentTypeSchema = z.enum(["correspondence", "inspection"]);
export type EsignatureDocumentType = z.infer<typeof esignatureDocumentTypeSchema>;

/**
 * Raw base64 of a PNG drawn on a canvas signature pad (no `data:image/...`
 * prefix -- the client strips it before sending). Optional everywhere it's
 * used: a signer without a drawing surface (or a not-yet-updated client)
 * still signs with just the typed name, matching how this app worked before
 * e-signature existed. Capped well above what a signature pad realistically
 * produces (a few hundred pixels of hand-drawn strokes) so nobody
 * accidentally posts a full-resolution photo through this field.
 */
export const signatureImageBase64Schema = z.string().min(1).max(400_000).optional();

export interface EsignatureVerification {
  signed: boolean;
  signerName: string | null;
  signedAt: string | null;
  hasImage: boolean;
  verified: boolean | null;
  contentHash: string | null;
}
