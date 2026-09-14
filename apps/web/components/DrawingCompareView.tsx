"use client";

import { useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdfjs";

interface Props {
  baseUrl: string;
  overlayUrl: string;
  errorLabel: string;
  baseLabel: string;
  overlayLabel: string;
}

const BASE_TINT: [number, number, number] = [37, 99, 235]; // navy/blue — the earlier revision
const OVERLAY_TINT: [number, number, number] = [220, 38, 38]; // red — the newer revision

/** Recolors a rendered page: ink (dark pixels) becomes an opaque tint of `color`, background becomes fully transparent, so it can be layered over another tinted page. Standard "duotone" technique via per-pixel alpha from luminance. */
function tint(source: HTMLCanvasElement, color: [number, number, number]): HTMLCanvasElement {
  const { width, height } = source;
  const srcCtx = source.getContext("2d");
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d");
  if (!srcCtx || !outCtx) return out;

  const srcData = srcCtx.getImageData(0, 0, width, height);
  const outData = outCtx.createImageData(width, height);
  for (let i = 0; i < srcData.data.length; i += 4) {
    const luminance = (srcData.data[i]! + srcData.data[i + 1]! + srcData.data[i + 2]!) / 3;
    outData.data[i] = color[0];
    outData.data[i + 1] = color[1];
    outData.data[i + 2] = color[2];
    outData.data[i + 3] = 255 - luminance;
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}

/**
 * Revision comparison overlay, Procore-style: the earlier revision's ink
 * renders in blue and the later one in red, composited on the same sheet —
 * unchanged linework blends dark/purple, removed content shows pure blue,
 * added content shows pure red. Assumes both revisions share the same sheet
 * size (the normal case); if not, the overlay page is stretched to fit the
 * base page's dimensions rather than failing.
 */
export function DrawingCompareView({ baseUrl, overlayUrl, errorLabel, baseLabel, overlayLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(false);

    async function render(): Promise<void> {
      try {
        const pdfjsLib = await loadPdfjs();

        async function renderPage(url: string): Promise<HTMLCanvasElement> {
          const doc = await pdfjsLib.getDocument({ url }).promise;
          const page = await doc.getPage(1);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas 2D context unavailable");
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          return canvas;
        }

        const [baseCanvas, overlayCanvas] = await Promise.all([renderPage(baseUrl), renderPage(overlayUrl)]);
        if (cancelled) return;

        const target = canvasRef.current;
        if (!target) return;
        target.width = baseCanvas.width;
        target.height = baseCanvas.height;
        const targetCtx = target.getContext("2d");
        if (!targetCtx) return;

        targetCtx.fillStyle = "#ffffff";
        targetCtx.fillRect(0, 0, target.width, target.height);
        targetCtx.drawImage(tint(baseCanvas, BASE_TINT), 0, 0);
        targetCtx.drawImage(tint(overlayCanvas, OVERLAY_TINT), 0, 0, overlayCanvas.width, overlayCanvas.height, 0, 0, target.width, target.height);

        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, overlayUrl]);

  return (
    <div>
      {error && <p className="text-maroon-700">{errorLabel}</p>}
      {!ready && !error && <div className="h-40 animate-pulse rounded-lg bg-navy-100" />}
      <div className="mb-2 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: `rgb(${BASE_TINT.join(",")})` }} />
          {baseLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: `rgb(${OVERLAY_TINT.join(",")})` }} />
          {overlayLabel}
        </span>
      </div>
      <canvas ref={canvasRef} className="max-w-full border border-ink bg-white" style={{ display: ready ? "block" : "none" }} />
    </div>
  );
}
