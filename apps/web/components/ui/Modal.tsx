"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Wider panel for content-heavy dialogs (e.g. global search). */
  wide?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * A real dialog, not a styled div: role="dialog", aria-modal, focus
 * moves into it on open and is trapped inside via Tab/Shift+Tab, Escape
 * closes it, and focus returns to whatever opened it. This is the one
 * modal implementation in the app going forward -- ConfirmDialog and
 * GlobalSearch both build on it rather than each hand-rolling their own
 * overlay + focus handling.
 */
export function Modal({ open, onClose, title, children, wide = false }: Props) {
  const t = useTranslations("Common");
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={`flex max-h-[75vh] w-full flex-col overflow-hidden rounded-xl border-3 border-ink bg-white shadow-brutal-lg ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
          <h2 id="modal-title" className="text-sm font-bold text-navy-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="rounded p-1 text-navy-500 hover:bg-navy-50 hover:text-navy-800">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
