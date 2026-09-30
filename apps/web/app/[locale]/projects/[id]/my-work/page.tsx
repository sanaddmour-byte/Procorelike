"use client";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { errorMessage } from "@/lib/error-message";
import { formatDate } from "@/lib/format";
import { useEnumLabel } from "@/lib/use-enum-label";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getRecents, type Recent } from "@/lib/recents";
import { useCallback, useEffect, useState } from "react";

type Bucket = "overdue" | "today" | "week" | "later" | "none";

interface WorkItem {
  module: "punch_list" | "rfis" | "submittals" | "corrective_actions";
  segment: string;
  id: string;
  number: string | null;
  title: string;
  status: string;
  dueDate: string | null;
  dueBucket: Bucket;
}

const BUCKETS: Bucket[] = ["overdue", "today", "week", "later", "none"];

/** Landing screen (plan E5): everything assigned to me or waiting on me, grouped by urgency, one tap to the record. */
export default function MyWorkPage() {
  const t = useTranslations("MyWork");
  const te = useTranslations("Errors");
  const tc = useTranslations("Common");
  const enumLabel = useEnumLabel();
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<Recent[]>([]);
  useEffect(() => setRecents(getRecents(params.id)), [params.id]);

  const load = useCallback(() => {
    setError(null);
    apiJson<WorkItem[]>(`/projects/${params.id}/my-work`)
      .then(setItems)
      .catch((e) => setError(errorMessage(e, te)));
  }, [params.id, te]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
  }, [router, locale, load]);

  const base = `/${locale}/projects/${params.id}`;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border-3 border-ink bg-white p-3">
          <p className="text-sm">{error}</p>
          <button type="button" onClick={load} className="min-h-hit self-start rounded-lg border-3 border-ink px-4 text-sm font-semibold">
            {tc("retry")}
          </button>
        </div>
      )}

      {!error && items === null && <p className="text-sm text-ink/70">{tc("loading")}</p>}

      {items && items.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-lg border-3 border-ink bg-white p-4">
          <p>{t("empty")}</p>
          <Link href={`${base}/punch-list/new`} className="inline-flex min-h-hit items-center rounded-lg border-3 border-ink bg-maroon-700 px-4 text-sm font-semibold text-white">
            {t("emptyAction")}
          </Link>
        </div>
      )}

      {items &&
        BUCKETS.map((b) => {
          const rows = items.filter((i) => i.dueBucket === b);
          if (rows.length === 0) return null;
          return (
            <section key={b} aria-label={t(b)}>
              <h2 className="sticky top-14 z-10 flex items-center justify-between bg-cream py-1 text-sm font-bold uppercase tracking-wide">
                <span className={b === "overdue" ? "text-red-700" : undefined}>{t(b)}</span>
                <span className="font-normal text-ink/70">{t("count", { count: rows.length })}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {rows.map((i) => (
                  <li key={`${i.module}-${i.id}`}>
                    <Link
                      href={`${base}/${i.segment}/${i.id}`}
                      className="flex min-h-[60px] items-center gap-3 rounded-lg border-3 border-ink bg-white px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-ink/70">
                          <span>{t(`module_${i.module}`)}</span>
                          {i.number && <bdi dir="ltr">{i.number}</bdi>}
                        </div>
                        <div className="truncate text-sm font-semibold">{i.title}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge label={enumLabel(i.status)} status={i.status} />
                        {i.dueDate && (
                          <span className="text-xs text-ink/70">
                            {t("due")} <bdi dir="ltr">{formatDate(i.dueDate)}</bdi>
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      {recents.length > 0 && (
        <section aria-label={t("recent")}>
          <h2 className="py-1 text-sm font-bold uppercase tracking-wide">{t("recent")}</h2>
          <ul className="flex flex-col gap-2">
            {recents.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link href={r.href as never} className="flex min-h-hit items-center gap-2 rounded-lg border-3 border-ink bg-white px-3 py-2 text-sm font-semibold">
                  <span aria-hidden="true">{r.kind === "punch" ? "📷" : r.kind === "rfi" ? "❓" : "📐"}</span>
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
