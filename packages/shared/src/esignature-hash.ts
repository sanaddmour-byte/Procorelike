import { createHash } from "node:crypto";
import { stableStringify } from "./business-rules/esignature";

/** sha256 of a document's canonical (key-order-independent) content, hex-encoded -- what an esignature row's contentHash stores, and what re-verifying it recomputes and compares against. Server-only: pulls in node:crypto. */
export function computeContentHash(content: unknown): string {
  return createHash("sha256").update(stableStringify(content)).digest("hex");
}
