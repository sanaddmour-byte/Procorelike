"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PunchItem {
  id: string;
  number: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "ready_for_review" | "approved" | "closed";
  needsReview: boolean;
}

export default function PunchListPage() {
  const t = useTranslations("PunchList");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [items, setItems] = useState<PunchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<PunchItem[]>(`/punch-items?projectId=${params.id}`)
      .then(setItems)
      .catch(() => setError(tc("errorGeneric")));
  }, [router, locale, params.id, tc]);

  function statusLabel(status: PunchItem["status"]): string {
    return {
      open: t("statusOpen"),
      ready_for_review: t("statusReadyForReview"),
      approved: t("statusApproved"),
      closed: t("statusClosed"),
    }[status];
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <Link
            href={`/${locale}/projects/${params.id}/punch-list/new`}
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {t("newButton")}
          </Link>
        </div>
        {error && <p className="text-red-600">{error}</p>}
        {!items && !error && <p>{tc("loading")}</p>}
        {items && items.length === 0 && <p>{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {items?.map((item) => (
            <li key={item.id}>
              <Link
                href={`/${locale}/projects/${params.id}/punch-list/${item.id}`}
                className="block rounded border border-slate-200 p-4 hover:border-slate-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {item.number} — {item.description}
                  </span>
                  <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {statusLabel(item.status)}
                  </span>
                </div>
                {item.needsReview && (
                  <p className="mt-1 text-xs font-medium text-amber-700">{t("needsReview")}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
