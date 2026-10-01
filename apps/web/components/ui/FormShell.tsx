"use client";

import { useTranslations } from "next-intl";
import type { FormEvent, ReactNode } from "react";

interface Props {
  onSubmit: () => void | Promise<void>;
  /** Primary label (e.g. "Create"). */
  submitLabel: string;
  submitting?: boolean;
  /** Second primary action that saves and reopens the form with context retained (plan D7). */
  onSaveAndAddAnother?: () => void | Promise<void>;
  onCancel?: () => void;
  error?: string | null;
  /** Shown once when a saved draft was restored. */
  restoredNotice?: boolean;
  children: ReactNode;
  disabled?: boolean;
}

/**
 * The one form frame (plan B7): fields scroll, the action bar is pinned to the bottom of the screen in the thumb
 * zone on phones (56 px targets, 8 px apart, primary first, cancel last and visually quiet), inline under the fields
 * on desktop. Destructive actions never go in this bar.
 */
export function FormShell({ onSubmit, submitLabel, submitting, onSaveAndAddAnother, onCancel, error, restoredNotice, children, disabled }: Props) {
  const t = useTranslations("Field");
  async function handle(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await onSubmit();
  }
  return (
    <form onSubmit={(e) => void handle(e)} className="flex flex-col gap-3 pb-28 md:pb-0">
      {restoredNotice && (
        <p role="status" className="rounded-lg border-3 border-ink bg-orange-50 px-3 py-2 text-sm font-semibold text-navy-900">
          {t("draftRestored")}
        </p>
      )}
      {children}
      {error && (
        <p role="alert" className="rounded-lg border-3 border-maroon-700 bg-maroon-50 px-3 py-2 text-sm font-semibold text-maroon-800">
          {error}
        </p>
      )}
      <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h,0px)] z-30 flex gap-gap-hit border-t border-ink bg-cream px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
        <button
          type="submit"
          disabled={submitting || disabled}
          className="hit-task min-w-task flex-1 rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 px-4 font-bold text-white brutal-interactive disabled:opacity-50 md:flex-none"
        >
          {submitLabel}
        </button>
        {onSaveAndAddAnother && (
          <button
            type="button"
            disabled={submitting || disabled}
            onClick={() => void onSaveAndAddAnother()}
            className="hit-task flex-1 rounded-lg border-3 border-ink bg-white px-3 font-bold text-navy-900 brutal-interactive disabled:opacity-50 md:flex-none"
          >
            {t("saveAndAddAnother")}
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="hit-task rounded-lg border-3 border-ink bg-transparent px-3 font-semibold text-navy-800">
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
