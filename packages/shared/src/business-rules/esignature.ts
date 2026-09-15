/**
 * A real e-signature needs something to be *of* -- a fixed snapshot of the
 * content the signer actually saw, so a later reader can prove nothing
 * changed since. This produces that snapshot's canonical text form:
 * recursively key-sorted JSON, so field order in the source object never
 * changes the result. `@siteops/shared/server`'s computeContentHash runs
 * this through sha256 -- kept out of the main barrel because it's only
 * needed server-side, but the stringify step itself is plain, browser-safe
 * JS, useful anywhere the same canonicalization is needed (e.g. a client
 * wanting to display what it's about to sign).
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
