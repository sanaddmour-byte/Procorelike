"use client";

import { Modal } from "./Modal";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, onConfirm, onCancel }: Props) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-navy-700">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border-3 border-ink px-3 py-1.5 text-sm font-semibold text-navy-800">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-lg border-3 border-ink px-3 py-1.5 text-sm font-semibold text-white brutal-interactive ${
            danger ? "bg-gradient-to-b from-red-600 to-red-700" : "bg-gradient-to-b from-maroon-600 to-maroon-700"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
