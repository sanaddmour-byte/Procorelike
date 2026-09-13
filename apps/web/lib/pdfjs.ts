import type * as PdfjsLib from "pdfjs-dist";

declare global {
  interface Map<K, V> {
    /** Stage-3 TC39 proposal, not yet in any shipping browser as of this writing -- typed here only so the polyfill below compiles. */
    getOrInsertComputed?(key: K, compute: (key: K) => V): V;
  }
}

let cached: typeof PdfjsLib | null = null;

/**
 * Loads pdf.js once (dynamic import so it's excluded from the initial page
 * bundle) and wires the bundled worker script. Also polyfills
 * `Map.prototype.getOrInsertComputed`: pdfjs-dist 6.x's main-thread
 * worker-messaging layer (the code that tracks pending RPC calls to the PDF
 * worker) calls this method on every page render, but it's a very recent
 * JS proposal not yet present even in current stable Chromium -- without
 * the polyfill, every render throws "getOrInsertComputed is not a
 * function" (found via manual browser testing, not caught by any
 * automated test).
 */
export async function loadPdfjs(): Promise<typeof PdfjsLib> {
  if (cached) return cached;
  const pdfjsLib = await import("pdfjs-dist");
  if (!Map.prototype.getOrInsertComputed) {
    Map.prototype.getOrInsertComputed = function <K, V>(this: Map<K, V>, key: K, compute: (key: K) => V): V {
      if (this.has(key)) return this.get(key) as V;
      const value = compute(key);
      this.set(key, value);
      return value;
    };
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  cached = pdfjsLib;
  return pdfjsLib;
}
