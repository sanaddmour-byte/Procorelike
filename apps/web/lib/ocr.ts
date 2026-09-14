import { loadPdfjs } from "./pdfjs";
import { extractSheetNumber } from "./sheet-number";

export interface OcrSheetResult {
  sheetNumber: string | null;
  rawText: string;
}

/**
 * Renders page 1 of an in-memory PDF to an offscreen canvas and runs
 * client-side OCR (tesseract.js, WASM -- no server round-trip or native
 * image-processing dependency) over it, then heuristically extracts a sheet
 * number from the recognized text. Mirrors Procore's "OCR suggests, you
 * confirm" pattern: this never auto-creates or auto-saves anything, it only
 * returns a suggestion for the caller to prefill into an editable form
 * field.
 *
 * tesseract.js's worker script, WASM core, and English trained-data are
 * served from this app's own /public/tesseract (vendored from the
 * tesseract.js/tesseract.js-core/@tesseract.js-data npm packages) rather
 * than tesseract.js's jsdelivr-CDN defaults -- construction-site
 * connectivity is often poor-to-nonexistent, and this feature otherwise
 * silently breaks the moment the CDN isn't reachable.
 */
export async function detectSheetInfoFromPdf(file: File): Promise<OcrSheetResult> {
  const pdfjsLib = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await doc.getPage(1);
  // Higher render scale than the viewer's 1.5x meaningfully improves OCR accuracy on small title-block text.
  const viewport = page.getViewport({ scale: 2.5 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  await page.render({ canvasContext: context, viewport, canvas }).promise;

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
    langPath: "/tesseract/lang-data",
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(canvas);
    return { sheetNumber: extractSheetNumber(text), rawText: text };
  } finally {
    await worker.terminate();
  }
}
