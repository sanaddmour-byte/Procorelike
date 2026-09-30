"use client";

import { useLocale, useTranslations } from "next-intl";
import Link, { type LinkProps } from "next/link";
import { useEffect, useState } from "react";

interface Props {
  /** The list endpoint the record came from, e.g. "/punch-items" -- same key the list stored its order under. */
  basePath: string;
  currentId: string;
  projectId: string;
  /** URL segment of the module, e.g. "punch-list". */
  segment: string;
}

/** Previous / Next through the list the user came from (plan B5): triage a queue without going back to the list each time. */
export function RecordNav({ basePath, currentId, projectId, segment }: Props) {
  const t = useTranslations("RecordNav");
  const locale = useLocale();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      setIds(JSON.parse(window.sessionStorage.getItem(`siteops.siblings:${basePath}`) ?? "[]") as string[]);
    } catch {
      setIds([]);
    }
  }, [basePath]);

  const i = ids.indexOf(currentId);
  if (i < 0 || ids.length < 2) return null;
  const href = (id: string): LinkProps["href"] => `/${locale}/projects/${projectId}/${segment}/${id}` as LinkProps["href"];
  const btn = "hit-task inline-flex min-w-task items-center justify-center rounded-lg border-3 border-ink bg-white px-3 font-bold text-navy-900";
  return (
    <nav aria-label={t("label")} className="mb-2 flex items-center justify-between gap-2">
      {i > 0 ? (
        <Link href={href(ids[i - 1]!)} className={btn}>
          <span aria-hidden="true" className="me-1 inline-block rtl:rotate-180">‹</span>{t("previous")}
        </Link>
      ) : (
        <span className={`${btn} opacity-40`} aria-disabled="true">
          <span aria-hidden="true" className="me-1 inline-block rtl:rotate-180">‹</span>{t("previous")}
        </span>
      )}
      <span className="text-sm text-ink/70" dir="ltr">
        {i + 1} / {ids.length}
      </span>
      {i < ids.length - 1 ? (
        <Link href={href(ids[i + 1]!)} className={btn}>
          {t("next")}<span aria-hidden="true" className="ms-1 inline-block rtl:rotate-180">›</span>
        </Link>
      ) : (
        <span className={`${btn} opacity-40`} aria-disabled="true">
          {t("next")}<span aria-hidden="true" className="ms-1 inline-block rtl:rotate-180">›</span>
        </span>
      )}
    </nav>
  );
}
