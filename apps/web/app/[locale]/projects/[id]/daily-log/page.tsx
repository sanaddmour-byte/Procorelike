"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface DailyLog {
  id: string;
  logDate: string;
  notes: string | null;
  lockedAt: string | null;
}

export default function DailyLogListPage() {
  const t = useTranslations("DailyLog");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [logs, setLogs] = useState<DailyLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<DailyLog[]>(`/daily-logs?projectId=${params.id}`)
      .then((data) => setLogs(data.sort((a, b) => (a.logDate < b.logDate ? 1 : -1))))
      .catch(() => setError(tc("errorGeneric")));
  }, [router, locale, params.id, tc]);

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <Link
            href={`/${locale}/projects/${params.id}/daily-log/new`}
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {t("newButton")}
          </Link>
        </div>
        {error && <p className="text-red-600">{error}</p>}
        {!logs && !error && <p>{tc("loading")}</p>}
        {logs && logs.length === 0 && <p>{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {logs?.map((log) => (
            <li key={log.id}>
              <Link
                href={`/${locale}/projects/${params.id}/daily-log/${log.id}`}
                className="block rounded border border-slate-200 p-4 hover:border-slate-400"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{log.logDate}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      log.lockedAt ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {log.lockedAt ? t("locked") : t("open")}
                  </span>
                </div>
                {log.notes && <p className="mt-1 truncate text-sm text-slate-500">{log.notes}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
