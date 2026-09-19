/**
 * The one place a monetary amount is turned into display text — every
 * financial page previously called its own ad-hoc `money()` helper that
 * did plain `.toLocaleString()` number formatting with no currency symbol
 * at all, silently discarding the `currency` column several financial
 * tables already store. `Intl.NumberFormat`'s `currency` style renders
 * the right symbol/code placement per locale (e.g. "$1,234.00" vs
 * "١٬٢٣٤٫٠٠ US$" for ar) without hand-rolling locale-specific formatting.
 */
export function formatMoney(value: string | number | null | undefined, currency: string, locale: string): string {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}
