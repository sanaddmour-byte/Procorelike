"use client";

import { useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdfjs";
import { MIN_STROKE_POINT_SPACING, SKETCH_COLORS } from "@/lib/sketch";

export type MarkupCoords =
  | { type: "pin"; x: number; y: number }
  | { type: "polygon"; points: [number, number][] }
  | { type: "freehand"; points: [number, number][]; color: string };

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
  /** Normalized (0-1) coordinates of a completed freehand stroke. */
  onAddFreehand?: (points: [number, number][], color: string) => void;
  pinToolLabel?: string;
  sketchToolLabel?: string;
  sketchHintLabel?: string;
}

/**
 * Renders page 1 of a PDF to a canvas via pdf.js and overlays markup pins
 * as absolutely-positioned dots, plus freehand redline strokes as an SVG
 * polyline overlay -- both keyed to normalized (0-1) sheet coordinates, so
 * they stay correctly placed regardless of render scale. This mirrors the
 * sketch tool on PdfViewerModal (same coordinate scheme, same SVG
 * technique), adapted to a single always-page-1 sheet instead of a
 * multi-page report. Polygon outlines (docs/DATA_MODEL.md §2) are still
 * unrendered -- out of scope for this pass.
 */
export function DrawingViewer({ pdfUrl, markups, errorLabel, onAddPin, onAddFreehand, pinToolLabel, sketchToolLabel, sketchHintLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const [tool, setTool] = useState<"pin" | "sketch">("pin");
  const [sketchColor, setSketchColor] = useState<string>(SKETCH_COLORS[0] ?? "#dc2626");
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<[number, number][]>([]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(false);

    async function render(): Promise<void> {
      try {
        const pdfjsLib = await loadPdfjs();
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
    if (!onAddPin || !ready || tool !== "pin") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onAddPin(x, y);
  }

  function normalizedPoint(e: React.PointerEvent<HTMLDivElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
    return [clamp01((e.clientX - rect.left) / rect.width), clamp01((e.clientY - rect.top) / rect.height)];
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (!onAddFreehand || !ready || tool !== "sketch") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    setCurrentStroke([normalizedPoint(e)]);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!isDrawing) return;
    const point = normalizedPoint(e);
    setCurrentStroke((prev) => {
      if (prev.length >= 2000) return prev;
      const last = prev[prev.length - 1];
      if (last && Math.abs(last[0] - point[0]) < MIN_STROKE_POINT_SPACING && Math.abs(last[1] - point[1]) < MIN_STROKE_POINT_SPACING) return prev;
      return [...prev, point];
    });
  }

  function handlePointerUp(): void {
    if (!isDrawing) return;
    setIsDrawing(false);
    const stroke = currentStroke;
    setCurrentStroke([]);
    if (onAddFreehand && stroke.length >= 2) onAddFreehand(stroke, sketchColor);
  }

  const showToolbar = Boolean(onAddPin && onAddFreehand);

  return (
    <div className="inline-block">
      {error && <p className="text-maroon-700">{errorLabel}</p>}
      {showToolbar && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTool("pin")}
            className={`rounded-lg border-3 border-ink px-2.5 py-1 text-xs font-semibold ${tool === "pin" ? "bg-gradient-to-b from-maroon-600 to-maroon-800 text-white" : "text-navy-800"}`}
          >
            {pinToolLabel}
          </button>
          <button
            type="button"
            onClick={() => setTool("sketch")}
            className={`rounded-lg border-3 border-ink px-2.5 py-1 text-xs font-semibold ${tool === "sketch" ? "bg-gradient-to-b from-maroon-600 to-maroon-800 text-white" : "text-navy-800"}`}
          >
            {sketchToolLabel}
          </button>
          {tool === "sketch" && (
            <div className="ml-1 flex items-center gap-1.5">
              {SKETCH_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setSketchColor(c)}
                  className={`h-5 w-5 rounded-full border-2 ${sketchColor === c ? "border-ink" : "border-white"} shadow`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <span className="ml-1 text-xs text-navy-600">{sketchHintLabel}</span>
            </div>
          )}
        </div>
      )}
      <div
        className="relative inline-block touch-none"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas ref={canvasRef} className={`max-w-full border border-ink bg-white ${onAddPin || onAddFreehand ? "cursor-crosshair" : ""}`} />
        {ready && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
            {markups.map((markup) =>
              markup.coords.type === "freehand" ? (
                <polyline
                  key={markup.id}
                  points={markup.coords.points.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={markup.coords.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
            {currentStroke.length > 1 && (
              <polyline
                points={currentStroke.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke={sketchColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        )}
        {ready &&
          markups.map((markup) =>
            markup.coords.type === "pin" ? (
              <div
                key={markup.id}
                title={markup.note ?? undefined}
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-maroon-600 shadow"
                style={{ left: `${markup.coords.x * 100}%`, top: `${markup.coords.y * 100}%` }}
              />
            ) : null,
          )}
      </div>
    </div>
  );
}
