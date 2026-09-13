"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "./api-client";

export interface PdfViewerState {
  open: boolean;
  data: Uint8Array | null;
  title: string;
  fileName: string;
  error: boolean;
}

const INITIAL_STATE: PdfViewerState = { open: false, data: null, title: "", fileName: "", error: false };

/**
 * Fetches a report PDF as raw bytes and drives a <PdfViewerModal> -- the
 * shared replacement for the old fetch-blob-then-window.open pattern every
 * "Export PDF" / "Export All (PDF)" button used, so a report now opens
 * inside SiteOps (with page navigation and zoom) instead of handing off to
 * the browser's own PDF viewer in a new tab.
 */
export function usePdfViewer() {
  const [state, setState] = useState<PdfViewerState>(INITIAL_STATE);

  const openPdf = useCallback(async (path: string, title: string, fileName: string): Promise<void> => {
    setState({ open: true, data: null, title, fileName, error: false });
    try {
      const res = await apiFetch(path);
      if (!res.ok) throw new Error("report_failed");
      const buf = await res.arrayBuffer();
      setState({ open: true, data: new Uint8Array(buf), title, fileName, error: false });
    } catch {
      setState((s) => ({ ...s, error: true }));
    }
  }, []);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return { ...state, openPdf, close };
}
