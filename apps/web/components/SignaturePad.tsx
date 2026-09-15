"use client";

import { useRef } from "react";

/**
 * A drawn e-signature, captured on a blank canvas rather than typed --
 * layered on top of the existing typed-name signature (kept for display and
 * as a fallback). `onChange` fires with the drawn PNG as raw base64 (no
 * `data:image/...` prefix) once the pointer lifts, or `null` once the pad is
 * cleared/empty, matching what the API's signatureImageBase64 fields expect.
 */
export function SignaturePad({
  onChange,
  clearLabel,
}: {
  onChange: (base64Png: string | null) => void;
  clearLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInkRef.current = true;
  }

  function handlePointerUp(): void {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) {
      onChange(null);
      return;
    }
    onChange(canvas.toDataURL("image/png").split(",")[1] ?? null);
  }

  function handleClear(): void {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <canvas
        ref={canvasRef}
        width={500}
        height={140}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="w-full touch-none rounded-lg border-3 border-ink bg-white"
      />
      <button type="button" onClick={handleClear} className="self-start text-xs text-navy-600 underline">
        {clearLabel}
      </button>
    </div>
  );
}
