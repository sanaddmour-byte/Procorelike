/**
 * Semantic status tones -- the single source of truth for "what color
 * means what" across the app. Every status pill/badge should resolve
 * through this map (via <StatusBadge tone="..." />) rather than picking
 * a Tailwind color inline, so "approved" is always green and "overdue"
 * is always red no matter which module renders it.
 *
 * Maroon/orange (the SiteOps brand colors) are deliberately absent here:
 * per the design brief, maroon means "SiteOps branding / primary
 * action," not a workflow state, so it never appears as a status color.
 */
export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-gray-100 text-gray-700 border-gray-300",
  info: "bg-blue-50 text-blue-700 border-blue-300",
  warning: "bg-amber-50 text-amber-800 border-amber-300",
  success: "bg-green-50 text-green-700 border-green-300",
  danger: "bg-red-50 text-red-700 border-red-300",
};

/**
 * Default tone for a handful of status strings that recur across
 * multiple modules (draft/open/approved/rejected/closed/overdue/...).
 * Module-specific statuses that don't appear here should map explicitly
 * at the call site (e.g. a submittal's "revise_and_resubmit") rather
 * than falling through a guess -- this table is a convenience for the
 * common cross-module vocabulary, not an exhaustive enum.
 */
export const COMMON_STATUS_TONE: Record<string, StatusTone> = {
  draft: "neutral",
  closed: "neutral",
  canceled: "neutral",
  cancelled: "neutral",
  none: "neutral",
  inactive: "neutral",

  open: "info",
  submitted: "info",
  pending: "info",
  in_progress: "info",

  in_review: "warning",
  pending_approval: "warning",
  under_review: "warning",
  shortlisted: "warning",
  ready_for_review: "warning",
  action_required: "warning",

  approved: "success",
  completed: "success",
  qualified: "success",
  awarded: "success",
  active: "success",
  answered: "success",
  paid: "success",

  rejected: "danger",
  disqualified: "danger",
  overdue: "danger",
  failed: "danger",
  not_accepted: "danger",
};

export function toneForStatus(status: string): StatusTone {
  return COMMON_STATUS_TONE[status] ?? "neutral";
}
