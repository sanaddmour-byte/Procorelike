"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Dashboard {
  rfis?: { total: number; open: number; overdue: number };
  punchList?: { total: number; byStatus: Record<string, number> };
  budget?: { revisedTotal: number; projectedTotal: number; varianceTotal: number };
  changeOrders?: { total: number; byStatus: Record<string, number> };
}

function money(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const t = useTranslations("Dashboard");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<Dashboard>(`/projects/${params.id}/dashboard`)
      .then(setDashboard)
      .catch(() => setError(tc("errorGeneric")));
  }, [router, locale, params.id, tc]);

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        {error && <p className="text-maroon-700">{error}</p>}
        {!dashboard && !error && <p>{tc("loading")}</p>}

        {dashboard && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {dashboard.rfis && (
              <div className="rounded-xl border-3 border-ink bg-white shadow-brutal p-5">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("rfis")}</h2>
                <div className="flex gap-6">
                  <Tile label={t("rfisTotal")} value={dashboard.rfis.total} />
                  <Tile label={t("rfisOpen")} value={dashboard.rfis.open} />
                  <Tile label={t("rfisOverdue")} value={dashboard.rfis.overdue} accent="maroon" />
                </div>
              </div>
            )}

            {dashboard.punchList && (
              <div className="rounded-xl border-3 border-ink bg-white shadow-brutal p-5">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("punchList")}</h2>
                <div className="flex flex-wrap gap-6">
                  {Object.entries(dashboard.punchList.byStatus).map(([status, count]) => (
                    <Tile key={status} label={status} value={count} />
                  ))}
                </div>
              </div>
            )}

            {dashboard.budget && (
              <div className="rounded-xl border-3 border-ink bg-orange-50 shadow-brutal p-5">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("budget")}</h2>
                <div className="flex flex-wrap gap-6">
                  <MoneyTile label={t("budgetRevised")} value={dashboard.budget.revisedTotal} />
                  <MoneyTile label={t("budgetProjected")} value={dashboard.budget.projectedTotal} />
                  <MoneyTile label={t("budgetVariance")} value={dashboard.budget.varianceTotal} accent={dashboard.budget.varianceTotal < 0 ? "maroon" : undefined} />
                </div>
              </div>
            )}

            {dashboard.changeOrders && (
              <div className="rounded-xl border-3 border-ink bg-white shadow-brutal p-5">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("changeOrders")}</h2>
                <div className="flex flex-wrap gap-6">
                  {Object.entries(dashboard.changeOrders.byStatus).map(([status, count]) => (
                    <Tile key={status} label={status} value={count} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: "maroon" }) {
  return (
    <div>
      <div className={`text-2xl font-extrabold ${accent === "maroon" ? "text-maroon-700" : "text-navy-900"}`}>{value}</div>
      <div className="text-xs text-navy-600">{label}</div>
    </div>
  );
}

function MoneyTile({ label, value, accent }: { label: string; value: number; accent?: "maroon" }) {
  return (
    <div>
      <div className={`text-xl font-extrabold ${accent === "maroon" ? "text-maroon-700" : "text-navy-900"}`}>{money(value)}</div>
      <div className="text-xs text-navy-600">{label}</div>
    </div>
  );
}
