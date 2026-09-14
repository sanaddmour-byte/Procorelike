"use client";

import { apiJson } from "@/lib/api-client";
import type { PdfCommentRecordType } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfjs } from "@/lib/pdfjs";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.25;

export interface PdfCommentContext {
  projectId: string;
  recordType: PdfCommentRecordType;
  recordId: string;
}

interface PdfComment {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  commentText: string;
  linkedRfiId: string | null;
}

interface SketchPoint {
  x: number;
  y: number;
}

interface PdfSketch {
  id: string;
  pageNumber: number;
  points: SketchPoint[];
  color: string;
}

const SKETCH_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#111827"];
const MIN_STROKE_POINT_SPACING = 0.002;

interface RfiOption {
  id: string;
  number: string;
  subject: string;
}

interface Props {
  open: boolean;
  data: Uint8Array | null;
  error: boolean;
  title: string;
  fileName: string;
  onClose: () => void;
  /** When set, enables click-to-pin commenting on the rendered page, posted to /pdf-comments and optionally linked to an RFI. */
  commentContext?: PdfCommentContext;
}

/**
 * In-app PDF viewer -- page navigation + zoom, rendered via pdf.js onto a
 * canvas (the same library and worker-loading pattern DrawingViewer.tsx
 * already uses for single-sheet drawings, generalized here for a
 * multi-page report with navigation and zoom controls). Replaces every
 * export button's old fetch-blob-then-window.open handoff to the
 * browser's own PDF viewer.
 *
 * When `commentContext` is supplied, also renders click-to-pin comments
 * (mirroring DrawingViewer's markup pins) that persist to /pdf-comments
 * and can each optionally reference an RFI.
 */
export function PdfViewerModal({ open, data, error, title, fileName, onClose, commentContext }: Props) {
  const t = useTranslations("Common");
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [loading, setLoading] = useState(false);
  const [renderError, setRenderError] = useState(false);

  const [comments, setComments] = useState<PdfComment[]>([]);
  const [rfiOptions, setRfiOptions] = useState<RfiOption[]>([]);
  const [pendingPin, setPendingPin] = useState<{ pageNumber: number; x: number; y: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [newCommentRfiId, setNewCommentRfiId] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState(false);

  const [tool, setTool] = useState<"comment" | "sketch">("comment");
  const [sketches, setSketches] = useState<PdfSketch[]>([]);
  const [sketchColor, setSketchColor] = useState(SKETCH_COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<SketchPoint[]>([]);

  async function reloadComments(ctx: PdfCommentContext): Promise<void> {
    try {
      const rows = await apiJson<PdfComment[]>(
        `/pdf-comments?projectId=${ctx.projectId}&recordType=${ctx.recordType}&recordId=${ctx.recordId}`,
      );
      setComments(rows);
    } catch {
      setCommentError(true);
    }
  }

  async function reloadSketches(ctx: PdfCommentContext): Promise<void> {
    try {
      const rows = await apiJson<PdfSketch[]>(
        `/pdf-sketches?projectId=${ctx.projectId}&recordType=${ctx.recordType}&recordId=${ctx.recordId}`,
      );
      setSketches(rows);
    } catch {
      setCommentError(true);
    }
  }

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

  // Load existing comments and sketches (and the project's RFIs, for the "link to RFI" picker) once per open.
  useEffect(() => {
    if (!open || !commentContext) {
      setComments([]);
      setRfiOptions([]);
      setSketches([]);
      return;
    }
    setCommentError(false);
    void reloadComments(commentContext);
    void reloadSketches(commentContext);
    apiJson<RfiOption[]>(`/rfis?projectId=${commentContext.projectId}`)
      .then(setRfiOptions)
      .catch(() => undefined);
  }, [open, commentContext?.projectId, commentContext?.recordType, commentContext?.recordId]);

  useEffect(() => {
    setPendingPin(null);
    setNewCommentText("");
    setNewCommentRfiId("");
    setIsDrawing(false);
    setCurrentStroke([]);
  }, [pageNum]);

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

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (!commentContext || tool !== "comment") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPendingPin({ pageNumber: pageNum, x, y });
    setNewCommentText("");
    setNewCommentRfiId("");
  }

  function normalizedPoint(e: React.PointerEvent<HTMLDivElement>): SketchPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  }

  function handleSketchPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (!commentContext || tool !== "sketch") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    setCurrentStroke([normalizedPoint(e)]);
  }

  function handleSketchPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!isDrawing) return;
    const point = normalizedPoint(e);
    setCurrentStroke((prev) => {
      if (prev.length >= 2000) return prev;
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.x - point.x) < MIN_STROKE_POINT_SPACING && Math.abs(last.y - point.y) < MIN_STROKE_POINT_SPACING) return prev;
      return [...prev, point];
    });
  }

  async function handleSketchPointerUp(): Promise<void> {
    if (!isDrawing) return;
    setIsDrawing(false);
    const stroke = currentStroke;
    setCurrentStroke([]);
    if (!commentContext || stroke.length < 2) return;
    setCommentError(false);
    try {
      await apiJson("/pdf-sketches", {
        method: "POST",
        body: JSON.stringify({
          projectId: commentContext.projectId,
          recordType: commentContext.recordType,
          recordId: commentContext.recordId,
          pageNumber: pageNum,
          points: stroke,
          color: sketchColor,
        }),
      });
      await reloadSketches(commentContext);
    } catch {
      setCommentError(true);
    }
  }

  async function handlePostComment(): Promise<void> {
    if (!commentContext || !pendingPin || !newCommentText.trim()) return;
    setPosting(true);
    setCommentError(false);
    try {
      await apiJson("/pdf-comments", {
        method: "POST",
        body: JSON.stringify({
          projectId: commentContext.projectId,
          recordType: commentContext.recordType,
          recordId: commentContext.recordId,
          pageNumber: pendingPin.pageNumber,
          x: pendingPin.x,
          y: pendingPin.y,
          commentText: newCommentText.trim(),
          linkedRfiId: newCommentRfiId || undefined,
        }),
      });
      setPendingPin(null);
      setNewCommentText("");
      setNewCommentRfiId("");
      await reloadComments(commentContext);
    } catch {
      setCommentError(true);
    } finally {
      setPosting(false);
    }
  }

  async function handleSetLink(commentId: string, linkedRfiId: string | null): Promise<void> {
    if (!commentContext) return;
    setCommentError(false);
    try {
      await apiJson(`/pdf-comments/${commentId}/link?projectId=${commentContext.projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ linkedRfiId }),
      });
      await reloadComments(commentContext);
    } catch {
      setCommentError(true);
    }
  }

  function rfiLabel(rfiId: string): string {
    const rfi = rfiOptions.find((r) => r.id === rfiId);
    return rfi ? `${rfi.number} — ${rfi.subject}` : rfiId;
  }

  if (!open) return null;

  const showControls = !error && !renderError && numPages > 0;
  const pageComments = comments.filter((c) => c.pageNumber === pageNum);
  const pageSketches = sketches.filter((s) => s.pageNumber === pageNum);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-3 border-ink px-4 py-3">
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

        {commentContext && showControls && (
          <div className="flex flex-wrap items-center gap-2 border-b-3 border-ink px-4 py-2">
            <button
              type="button"
              onClick={() => setTool("comment")}
              className={`rounded-lg border-3 border-ink px-2.5 py-1 text-xs font-semibold ${tool === "comment" ? "bg-gradient-to-b from-maroon-600 to-maroon-800 text-white" : "text-navy-800"}`}
            >
              {t("commentTool")}
            </button>
            <button
              type="button"
              onClick={() => setTool("sketch")}
              className={`rounded-lg border-3 border-ink px-2.5 py-1 text-xs font-semibold ${tool === "sketch" ? "bg-gradient-to-b from-maroon-600 to-maroon-800 text-white" : "text-navy-800"}`}
            >
              {t("sketchTool")}
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
                <span className="ml-1 text-xs text-navy-600">{t("sketchHint")}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-auto">
          <div className="flex items-center justify-center bg-navy-900/5 p-4">
            {error || renderError ? (
              <p className="text-maroon-700">{t("errorGeneric")}</p>
            ) : loading || !data ? (
              <p className="text-navy-600">{t("loading")}</p>
            ) : (
              <div
                className="relative inline-block touch-none"
                onClick={handleCanvasClick}
                onPointerDown={handleSketchPointerDown}
                onPointerMove={handleSketchPointerMove}
                onPointerUp={() => void handleSketchPointerUp()}
                onPointerCancel={() => void handleSketchPointerUp()}
              >
                <canvas
                  ref={canvasRef}
                  className={`max-w-full border border-ink bg-white shadow-brutal-sm ${commentContext ? "cursor-crosshair" : ""}`}
                />
                {(pageSketches.length > 0 || currentStroke.length > 1) && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                    {pageSketches.map((s) => (
                      <polyline
                        key={s.id}
                        points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {currentStroke.length > 1 && (
                      <polyline
                        points={currentStroke.map((p) => `${p.x},${p.y}`).join(" ")}
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
                {pageComments.map((c, i) => (
                  <a
                    key={c.id}
                    href={`#pdf-comment-${c.id}`}
                    className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-maroon-600 text-[10px] font-bold text-white shadow"
                    style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {i + 1}
                  </a>
                ))}
                {pendingPin && pendingPin.pageNumber === pageNum && (
                  <span
                    className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow"
                    style={{ left: `${pendingPin.x * 100}%`, top: `${pendingPin.y * 100}%` }}
                  />
                )}
              </div>
            )}
          </div>

          {commentContext && showControls && (
            <div className="border-t-3 border-ink px-4 py-3">
              {pendingPin && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handlePostComment();
                  }}
                  className="mb-3 flex flex-col gap-2 rounded-lg border-3 border-ink bg-white p-3"
                >
                  <textarea
                    required
                    rows={2}
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder={t("commentPlaceholder")}
                    className="rounded-lg border-3 border-ink px-2 py-1.5 text-sm"
                  />
                  {rfiOptions.length > 0 && (
                    <select
                      value={newCommentRfiId}
                      onChange={(e) => setNewCommentRfiId(e.target.value)}
                      className="min-w-0 max-w-full rounded-lg border-3 border-ink px-2 py-1.5 text-sm"
                    >
                      <option value="">{t("linkToRfiPlaceholder")}</option>
                      {rfiOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.number} — {r.subject}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={posting || !newCommentText.trim()}
                      className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      {t("postComment")}
                    </button>
                    <button type="button" onClick={() => setPendingPin(null)} className="rounded-lg border-3 border-ink px-3 py-1.5 text-sm text-navy-800">
                      {t("cancel")}
                    </button>
                  </div>
                </form>
              )}

              {commentError && <p className="mb-2 text-sm text-maroon-700">{t("errorGeneric")}</p>}

              <h3 className="mb-1.5 text-sm font-semibold text-navy-800">{t("comments")}</h3>
              {pageComments.length === 0 ? (
                <p className="text-sm text-navy-600">{t("noComments")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {pageComments.map((c, i) => (
                    <li key={c.id} id={`pdf-comment-${c.id}`} className="rounded-lg border-3 border-ink bg-white p-2.5 text-sm">
                      <p>
                        <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-maroon-600 text-[10px] font-bold text-white">
                          {i + 1}
                        </span>
                        {c.commentText}
                      </p>
                      {c.linkedRfiId ? (
                        <p className="mt-1 text-xs text-navy-600">
                          {t("linkedToRfi")}:{" "}
                          <Link href={`/${locale}/projects/${commentContext.projectId}/rfis/${c.linkedRfiId}`} className="text-navy-800 underline">
                            {rfiLabel(c.linkedRfiId)}
                          </Link>{" "}
                          <button type="button" onClick={() => void handleSetLink(c.id, null)} className="text-navy-500 underline">
                            {t("unlink")}
                          </button>
                        </p>
                      ) : (
                        rfiOptions.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <select
                              defaultValue=""
                              onChange={(e) => e.target.value && void handleSetLink(c.id, e.target.value)}
                              className="min-w-0 max-w-full rounded-lg border-2 border-ink px-1.5 py-1 text-xs"
                            >
                              <option value="">{t("linkToRfiPlaceholder")}</option>
                              {rfiOptions.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.number} — {r.subject}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
