/**
 * One place for date / number / enum presentation (plan A3). Rules:
 *  - Dates are always `YYYY-MM-DD` and date-times `YYYY-MM-DD HH:mm` (local time): unambiguous on a site where
 *    03/09 means different things to different people, sortable, and identical in English and Arabic.
 *  - Digits are Western (0-9) in both languages -- matches how sheet and RFI numbers are written on drawings.
 *  - Record numbers and dates are wrapped in a left-to-right isolate when rendered inside RTL text (`<Ltr>`),
 *    so "PL-0042" and "2026-09-30" never reorder.
 */
const pad = (n: number): string => String(n).padStart(2, "0");

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && !value.includes("T")) return value.slice(0, 10);
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatNumber(value: number, locale: string): string {
  // `-u-nu-latn` forces Western digits for Arabic too.
  return new Intl.NumberFormat(`${locale}-u-nu-latn`).format(value);
}

/** "ready_for_review" -> "Ready for review": fallback when no translation exists for an enum value. */
export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
