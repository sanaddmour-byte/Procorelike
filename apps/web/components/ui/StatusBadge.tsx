import { STATUS_TONE_CLASSES, toneForStatus, type StatusTone } from "@/lib/design/status";

interface Props {
  /** The human-readable label to display (already translated by the caller). */
  label: string;
  /** Either pass an explicit tone, or a raw status string to resolve via toneForStatus. */
  tone?: StatusTone;
  status?: string;
  className?: string;
}

/**
 * The one place a status renders as color. Never rely on color alone --
 * the label text always carries the meaning too, so this remains legible
 * without color (a11y: color is a reinforcement, not the only signal).
 */
export function StatusBadge({ label, tone, status, className = "" }: Props) {
  const resolvedTone = tone ?? (status ? toneForStatus(status) : "neutral");
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE_CLASSES[resolvedTone]} ${className}`}
    >
      {label}
    </span>
  );
}
