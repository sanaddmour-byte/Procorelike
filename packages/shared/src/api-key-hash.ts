import { createHash, randomBytes } from "node:crypto";

/**
 * A fresh API key's plaintext (shown to the user exactly once, at creation
 * time -- only its hash and prefix are ever stored) plus the display
 * prefix stored alongside the hash so a company can tell its keys apart
 * without the full secret. Server-only: pulls in node:crypto.
 */
export function generateApiKey(): { plaintext: string; prefix: string } {
  const plaintext = `sk_live_${randomBytes(24).toString("base64url")}`;
  return { plaintext, prefix: plaintext.slice(0, 14) };
}

/** sha256 of an API key's plaintext, hex-encoded. Deterministic (unlike hashPassword's argon2) because auth must look a key up BY its hash, not verify against an already-known row. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
