"use client";

import { Header } from "@/components/Header";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RfiRollup {
  total: number;
  open: number;
  overdue: number;
}

interface PunchListRollup {
  total: number;
  byStatus: Record<string, number>;
}

interface BudgetRollup {
  originalTotal: number;
  approvedChangesTotal: number;
  revisedTotal: number;
  projectedTotal: number;
  varianceTotal: number;
}

interface ChangeOrderRollup {
  total: number;
  byStatus: Record<string, number>;
}

interface ProjectDashboard {
  rfis?: RfiRollup;
  punchList?: PunchListRollup;
  budget?: BudgetRollup;
  changeOrders?: ChangeOrderRollup;
}

interface CompanyProjectDashboard {
  projectId: string;
  projectName: string;
  dashboard: ProjectDashboard;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CompanyDashboardPage() {
  const t = useTranslations("CompanyDashboard");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [rows, setRows] = useState<CompanyProjectDashboard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<CompanyProjectDashboard[]>(`/admin/companies/${params.id}/dashboard`)
      .then(setRows)
      .catch(() => setError(tc("errorGeneric")));
  }, [router, locale, params.id, tc]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href={`/${locale}/companies`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>
        <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        <p className="mb-6 text-sm text-navy-600">{t("intro")}</p>
        {error && <p className="text-maroon-700">{error}</p>}
        {!rows && !error && <p>{tc("loading")}</p>}
        {rows && rows.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <div className="flex flex-col gap-4">
          {rows?.map((row) => (
            <div key={row.projectId} className="overflow-hidden rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal">
              <div className="h-2 bg-orange-500" aria-hidden="true" />
              <div className="p-4">
                <Link href={`/${locale}/projects/${row.projectId}/dashboard`} className="text-lg font-bold text-navy-900 underline">
                  {row.projectName}
                </Link>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {row.dashboard.rfis && (
                    <div className="rounded-lg border-2 border-orange-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase text-navy-600">{t("rfis")}</div>
                      <div className="text-xl font-extrabold text-navy-900">{row.dashboard.rfis.open}</div>
                      <div className="text-xs text-navy-600">{t("openOfTotal", { open: row.dashboard.rfis.open, total: row.dashboard.rfis.total })}</div>
                    </div>
                  )}
                  {row.dashboard.punchList && (
                    <div className="rounded-lg border-2 border-orange-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase text-navy-600">{t("punchList")}</div>
                      <div className="text-xl font-extrabold text-navy-900">{row.dashboard.punchList.total}</div>
                    </div>
                  )}
                  {row.dashboard.changeOrders && (
                    <div className="rounded-lg border-2 border-orange-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase text-navy-600">{t("changeOrders")}</div>
                      <div className="text-xl font-extrabold text-navy-900">{row.dashboard.changeOrders.total}</div>
                    </div>
                  )}
                  {row.dashboard.budget && (
                    <div className="rounded-lg border-2 border-orange-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase text-navy-600">{t("budgetVariance")}</div>
                      <div className="text-xl font-extrabold text-navy-900">{money(row.dashboard.budget.varianceTotal)}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
