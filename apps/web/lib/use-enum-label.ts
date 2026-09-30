"use client";

import { humanize } from "@/lib/format";
import { useTranslations } from "next-intl";

/** Translates a raw enum value via the `Enums` namespace, falling back to a humanised string (never the raw key). */
export function useEnumLabel(): (value: string) => string {
  const t = useTranslations("Enums");
  return (value: string) => (t.has(value) ? t(value) : humanize(value));
}
