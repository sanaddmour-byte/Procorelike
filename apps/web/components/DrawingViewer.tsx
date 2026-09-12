"use client";

import { useEffect, useRef, useState } from "react";

export type MarkupCoords =
  | { type: "pin"; x: number; y: number }
  | { type: "polygon"; points: [number, number][] };

export interface MarkupPin {
  id: string;
  coords: MarkupCoords;
  note: string | null;
}

interface Props {
  pdfUrl: string;
  markups: MarkupPin[];
  errorLabel: string;
  /** Normalized (0-1) coordinates within the rendered page. */
  onAddPin?: (x: number, y: number) => void;
}

/**
 * Renders page 1 of a PDF to a canvas via pdf.js and overlays markup pins
 * as absolutely-positioned dots keyed to normalized (0-1) sheet
 * coordinates, so they stay correctly placed regardless of render scale.
 * Only pin markups are drawn (docs/DATA_MODEL.md §2 also allows polygon
 * outlines; rendering those is deferred — out of scope for this pass).
 */
export function DrawingViewer({ pdfUrl, markups, errorLabel, onAddPin }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(false);

    async function render(): Promise<void> {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const doc = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) return;

        await page.render({ canvasContext: context, viewport, canvas }).promise;
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (!onAddPin || !ready) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onAddPin(x, y);
  }

  return (
    <div className="inline-block">
      {error && <p className="text-red-600">{errorLabel}</p>}
      <div className="relative inline-block" onClick={handleClick}>
        <canvas ref={canvasRef} className="max-w-full cursor-crosshair border border-slate-300" />
        {ready &&
          markups.map((markup) =>
            markup.coords.type === "pin" ? (
              <div
                key={markup.id}
                title={markup.note ?? undefined}
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow"
                style={{ left: `${markup.coords.x * 100}%`, top: `${markup.coords.y * 100}%` }}
              />
            ) : null,
          )}
      </div>
    </div>
  );
}
