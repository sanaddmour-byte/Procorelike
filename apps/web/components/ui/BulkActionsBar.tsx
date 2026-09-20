"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

interface Props {
  count: number;
  onClear: () => void;
  children: ReactNode;
}

/**
 * A thin toolbar that appears above a DataTable once its `selection` prop
 * has at least one row checked -- "N selected" plus whatever action
 * buttons the page passes as children, plus a clear-selection button.
 * Deliberately generic: which bulk actions make sense (close, assign,
 * export, ...) and how each one calls its module's own API is a
 * per-module decision the page makes, not this component's job -- see
 * docs/DATA_MODEL.md §9p for the pattern this was built to pilot.
 */
export function BulkActionsBar({ count, onClear, children }: Props) {
  const tc = useTranslations("Common");
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border-3 border-ink bg-gradient-to-b from-navy-50 to-navy-100 px-3 py-2">
      <span className="text-sm font-semibold text-navy-800">{tc("selectedCount", { count })}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="ms-auto rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-xs font-semibold text-navy-800 hover:bg-navy-50"
      >
        {tc("clearSelection")}
      </button>
    </div>
  );
}
