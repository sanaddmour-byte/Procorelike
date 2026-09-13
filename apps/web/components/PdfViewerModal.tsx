"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfjs } from "@/lib/pdfjs";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.25;

interface Props {
  open: boolean;
  data: Uint8Array | null;
  error: boolean;
  title: string;
  fileName: string;
  onClose: () => void;
}

/**
 * In-app PDF viewer -- page navigation + zoom, rendered via pdf.js onto a
 * canvas (the same library and worker-loading pattern DrawingViewer.tsx
 * already uses for single-sheet drawings, generalized here for a
 * multi-page report with navigation and zoom controls). Replaces every
 * export button's old fetch-blob-then-window.open handoff to the
 * browser's own PDF viewer.
 */
export function PdfViewerModal({ open, data, error, title, fileName, onClose }: Props) {
  const t = useTranslations("Common");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [loading, setLoading] = useState(false);
  const [renderError, setRenderError] = useState(false);

  // Load the document whenever new bytes arrive.
  useEffect(() => {
    if (!open || !data) return;
    const bytes = data;
    let cancelled = false;
    setLoading(true);
    setRenderError(false);
    setNumPages(0);
    setPageNum(1);
    setScale(DEFAULT_SCALE);
    docRef.current = null;

    async function load(): Promise<void> {
      try {
        const pdfjsLib = await loadPdfjs();
        const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
      } catch {
        if (!cancelled) setRenderError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  // Render the current page whenever the page number, zoom, or document changes.
  useEffect(() => {
    if (!open || numPages === 0) return;
    let cancelled = false;

    async function render(): Promise<void> {
      const doc = docRef.current;
      if (!doc) return;
      try {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) return;
        await page.render({ canvasContext: context, viewport, canvas }).promise;
      } catch {
        if (!cancelled) setRenderError(true);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [open, numPages, pageNum, scale]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function handleDownload(): void {
    if (!data) return;
    const blob = new Blob([new Uint8Array(data)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  const showControls = !error && !renderError && numPages > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b-3 border-ink px-4 py-3">
          <h2 className="truncate text-sm font-bold text-navy-900">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!data}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t("download")}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border-3 border-ink px-3 py-1.5 text-xs font-semibold text-navy-800">
              {t("close")}
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-navy-900/5 p-4">
          {error || renderError ? (
            <p className="text-maroon-700">{t("errorGeneric")}</p>
          ) : loading || !data ? (
            <p className="text-navy-600">{t("loading")}</p>
          ) : (
            <canvas ref={canvasRef} className="max-w-full border border-ink bg-white shadow-brutal-sm" />
          )}
        </div>

        {showControls && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-3 border-ink px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                disabled={pageNum <= 1}
                aria-label={t("previousPage")}
                className="rounded-lg border-3 border-ink px-2.5 py-1 text-sm font-semibold text-navy-800 disabled:opacity-40"
              >
                &#8249;
              </button>
              <span className="whitespace-nowrap text-sm text-navy-800">{t("pageIndicator", { current: pageNum, total: numPages })}</span>
              <button
                type="button"
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                disabled={pageNum >= numPages}
                aria-label={t("nextPage")}
                className="rounded-lg border-3 border-ink px-2.5 py-1 text-sm font-semibold text-navy-800 disabled:opacity-40"
              >
                &#8250;
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
                disabled={scale <= MIN_SCALE}
                aria-label={t("zoomOut")}
                className="rounded-lg border-3 border-ink px-2.5 py-1 text-sm font-semibold text-navy-800 disabled:opacity-40"
              >
                &minus;
              </button>
              <span className="w-12 text-center text-sm text-navy-800">{Math.round(scale * 100)}%</span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
                disabled={scale >= MAX_SCALE}
                aria-label={t("zoomIn")}
                className="rounded-lg border-3 border-ink px-2.5 py-1 text-sm font-semibold text-navy-800 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
