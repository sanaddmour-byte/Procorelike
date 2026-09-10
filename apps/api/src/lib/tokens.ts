import { createHmac, randomBytes } from "node:crypto";

/** Long, high-entropy opaque tokens for refresh tokens and invites (not JWTs — easy to revoke by hash lookup). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}
