import { createHmac, randomBytes } from "node:crypto";

/** A fresh per-subscription signing secret, shown once at creation like an API key's plaintext. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** HMAC-SHA256 of the exact bytes sent as the request body, hex-encoded -- the receiver recomputes this over the raw body with their own copy of the secret and compares to the `X-SiteOps-Signature` header. */
export function signWebhookPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
