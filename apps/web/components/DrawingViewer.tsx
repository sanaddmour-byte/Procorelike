"use client";

import { useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdfjs";
import { MIN_STROKE_POINT_SPACING, SKETCH_COLORS } from "@/lib/sketch";

export type MarkupCoords =
  | { type: "pin"; x: number; y: number }
  | { type: "polygon"; points: [number, number][] }
  | { type: "freehand"; points: [number, number][]; color: string }
  | { type: "cloud"; points: [number, number][]; color: string }
  | { type: "box"; x: number; y: number; width: number; height: number; color: string }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number; color: string }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; color: string }
  | { type: "text"; x: number; y: number; text: string; color: string }
  | { type: "measurement"; x1: number; y1: number; x2: number; y2: number; color: string };

export interface MarkupPin {
  id: string;
  coords: MarkupCoords;
  note: string | null;
}

type Tool = "pin" | "sketch" | "cloud" | "box" | "ellipse" | "arrow" | "line" | "text" | "measurement";

/** Tools placed by dragging from a start point to an end point (a bounding box or a two-point line). */
const TWO_POINT_TOOLS: readonly Tool[] = ["cloud", "box", "ellipse", "arrow", "line", "measurement"];

interface Props {
  pdfUrl: string;
  markups: MarkupPin[];
  errorLabel: string;
  /** Fires with a completed shape's coordinates, in the same shape the create-markup API expects. */
  onAddMarkup?: (coords: MarkupCoords) => void;
  toolLabels?: Partial<Record<Tool, string>>;
  sketchHintLabel?: string;
  textPromptLabel?: string;
}

/** Builds a scalloped "revision cloud" outline around a set of boundary points, Procore-style. */
function cloudPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const corners: [number, number][] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
  const bumpsPerEdge = 6;
  let d = `M ${corners[0]![0]} ${corners[0]![1]}`;
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = corners[i]!;
    const [ex, ey] = corners[i + 1]!;
    for (let b = 1; b <= bumpsPerEdge; b++) {
      const t = b / bumpsPerEdge;
      const px = sx + (ex - sx) * t;
      const py = sy + (ey - sy) * t;
      d += ` Q ${px} ${py} ${px} ${py}`;
    }
  }
  return d;
}

/** Renders page 1 of one PDF revision with an interactive markup toolset, mirroring Procore's shape palette (cloud, box, ellipse, arrow, line, text, measurement) alongside the original pin/freehand tools. Every shape is anchored in normalized (0-1) sheet coordinates so it survives different viewer zoom levels/resolutions. */
export function DrawingViewer({ pdfUrl, markups, errorLabel, onAddMarkup, toolLabels, sketchHintLabel, textPromptLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const [tool, setTool] = useState<Tool>("pin");
  const [sketchColor, setSketchColor] = useState<string>(SKETCH_COLORS[0] ?? "#dc2626");
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<[number, number][]>([]);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragCurrent, setDragCurrent] = useState<[number, number] | null>(null);

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

  function normalizedPoint(clientX: number, clientY: number, rect: DOMRect): [number, number] {
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
    return [clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height)];
  }

  function buildTwoPointShape(a: [number, number], b: [number, number]): MarkupCoords | null {
    const [x1, y1] = a;
    const [x2, y2] = b;
    switch (tool) {
      case "box":
        return { type: "box", x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), color: sketchColor };
      case "ellipse":
        return { type: "ellipse", cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2, color: sketchColor };
      case "arrow":
        return { type: "arrow", x1, y1, x2, y2, color: sketchColor };
      case "line":
        return { type: "line", x1, y1, x2, y2, color: sketchColor };
      case "measurement":
        return { type: "measurement", x1, y1, x2, y2, color: sketchColor };
      case "cloud": {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        return {
          type: "cloud",
          points: [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY],
          ],
          color: sketchColor,
        };
      }
      default:
        return null;
    }
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (!onAddMarkup || !ready) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (tool === "pin") {
      const [x, y] = normalizedPoint(e.clientX, e.clientY, rect);
      onAddMarkup({ type: "pin", x, y });
    } else if (tool === "text") {
      const text = window.prompt(textPromptLabel ?? "Text")?.trim();
      if (!text) return;
      const [x, y] = normalizedPoint(e.clientX, e.clientY, rect);
      onAddMarkup({ type: "text", x, y, text, color: sketchColor });
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (!ready) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (tool === "sketch") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDrawing(true);
      setCurrentStroke([normalizedPoint(e.clientX, e.clientY, rect)]);
    } else if (TWO_POINT_TOOLS.includes(tool)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const point = normalizedPoint(e.clientX, e.clientY, rect);
      setDragStart(point);
      setDragCurrent(point);
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    if (isDrawing) {
      const point = normalizedPoint(e.clientX, e.clientY, rect);
      setCurrentStroke((prev) => {
        if (prev.length >= 2000) return prev;
        const last = prev[prev.length - 1];
        if (last && Math.abs(last[0] - point[0]) < MIN_STROKE_POINT_SPACING && Math.abs(last[1] - point[1]) < MIN_STROKE_POINT_SPACING) return prev;
        return [...prev, point];
      });
    } else if (dragStart) {
      setDragCurrent(normalizedPoint(e.clientX, e.clientY, rect));
    }
  }

  function handlePointerUp(): void {
    if (isDrawing) {
      setIsDrawing(false);
      const stroke = currentStroke;
      setCurrentStroke([]);
      if (onAddMarkup && stroke.length >= 2) onAddMarkup({ type: "freehand", points: stroke, color: sketchColor });
      return;
    }
    if (dragStart && dragCurrent) {
      const shape = buildTwoPointShape(dragStart, dragCurrent);
      setDragStart(null);
      setDragCurrent(null);
      if (onAddMarkup && shape) onAddMarkup(shape);
    }
  }

  const showToolbar = Boolean(onAddMarkup);
  const label = (t: Tool, fallback: string): string => toolLabels?.[t] ?? fallback;

  return (
    <div className="inline-block">
      {error && <p className="text-maroon-700">{errorLabel}</p>}
      {showToolbar && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {(["pin", "sketch", "cloud", "box", "ellipse", "arrow", "line", "text", "measurement"] as Tool[]).map((toolId) => (
            <button
              key={toolId}
              type="button"
              onClick={() => setTool(toolId)}
              className={`rounded-lg border-3 border-ink px-2.5 py-1 text-xs font-semibold ${tool === toolId ? "bg-gradient-to-b from-maroon-600 to-maroon-800 text-white" : "text-navy-800"}`}
            >
              {label(toolId, toolId)}
            </button>
          ))}
          {tool !== "pin" && (
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
              {tool === "sketch" && <span className="ml-1 text-xs text-navy-600">{sketchHintLabel}</span>}
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
        <canvas ref={canvasRef} className={`max-w-full border border-ink bg-white ${onAddMarkup ? "cursor-crosshair" : ""}`} />
        {ready && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
            {markups.map((markup) => renderShape(markup.id, markup.coords, markup.note))}
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
            {dragStart && dragCurrent && (() => {
              const shape = buildTwoPointShape(dragStart, dragCurrent);
              return shape ? renderShape("__preview__", shape, null, 0.7) : null;
            })()}
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

function renderShape(key: string, coords: MarkupCoords, note: string | null, opacity = 1): React.ReactNode {
  switch (coords.type) {
    case "pin":
    case "polygon":
      return null; // pin renders as a DOM dot below; unrendered legacy polygon type, unchanged from before
    case "freehand":
      return (
        <polyline
          key={key}
          points={coords.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={coords.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={opacity}
        />
      );
    case "cloud":
      return <path key={key} d={cloudPath(coords.points)} fill="none" stroke={coords.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={opacity} />;
    case "box":
      return (
        <rect
          key={key}
          x={coords.x}
          y={coords.y}
          width={coords.width}
          height={coords.height}
          fill="none"
          stroke={coords.color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          opacity={opacity}
        />
      );
    case "ellipse":
      return (
        <ellipse
          key={key}
          cx={coords.cx}
          cy={coords.cy}
          rx={coords.rx}
          ry={coords.ry}
          fill="none"
          stroke={coords.color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          opacity={opacity}
        />
      );
    case "line":
      return (
        <line key={key} x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2} stroke={coords.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={opacity} />
      );
    case "arrow": {
      const angle = Math.atan2(coords.y2 - coords.y1, coords.x2 - coords.x1);
      const headLen = 0.02;
      const leftX = coords.x2 - headLen * Math.cos(angle - Math.PI / 7);
      const leftY = coords.y2 - headLen * Math.sin(angle - Math.PI / 7);
      const rightX = coords.x2 - headLen * Math.cos(angle + Math.PI / 7);
      const rightY = coords.y2 - headLen * Math.sin(angle + Math.PI / 7);
      return (
        <g key={key} opacity={opacity}>
          <line x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2} stroke={coords.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <polyline points={`${leftX},${leftY} ${coords.x2},${coords.y2} ${rightX},${rightY}`} fill="none" stroke={coords.color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </g>
      );
    }
    case "measurement": {
      const dx = coords.x2 - coords.x1;
      const dy = coords.y2 - coords.y1;
      const distancePct = (Math.sqrt(dx * dx + dy * dy) * 100).toFixed(1);
      return (
        <g key={key} opacity={opacity}>
          <line x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2} stroke={coords.color} strokeWidth={1.5} strokeDasharray="0.01 0.008" vectorEffect="non-scaling-stroke" />
          <text x={(coords.x1 + coords.x2) / 2} y={(coords.y1 + coords.y2) / 2 - 0.01} fontSize={0.018} fill={coords.color}>
            {distancePct}%
          </text>
        </g>
      );
    }
    case "text":
      return (
        <text key={key} x={coords.x} y={coords.y} fontSize={0.02} fill={coords.color} opacity={opacity}>
          {coords.text}
          {note ? "" : ""}
        </text>
      );
    default:
      return null;
  }
}
