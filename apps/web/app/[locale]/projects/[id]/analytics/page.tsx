"use client";

import { MonthlyBarChart } from "@/components/charts/MonthlyBarChart";
import { StatusBreakdown } from "@/components/charts/StatusBreakdown";
import { TrendBarChart } from "@/components/charts/TrendBarChart";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiJson, ApiClientError } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useProjectCurrency } from "@/lib/use-project-currency";
import { formatMoney } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface WeeklyPair {
  weekStart: string;
  created: number;
  resolved: number;
}

interface RfiAnalytics {
  createdVsAnsweredWeekly: WeeklyPair[];
  avgResponseTimeDays: number | null;
  byStatus: Record<string, number>;
}

interface PunchListAnalytics {
  createdVsClosedWeekly: WeeklyPair[];
  avgCycleTimeDays: number | null;
  byStatus: Record<string, number>;
}

interface SubmittalAnalytics {
  createdVsResolvedWeekly: WeeklyPair[];
  avgCycleTimeDays: number | null;
  byStatus: Record<string, number>;
}

interface SafetyAnalytics {
  incidentsWeekly: { weekStart: string; count: number }[];
  bySeverity: Record<string, number>;
  avgTimeToCloseDays: number | null;
}

interface ChangeOrderAnalytics {
  approvedCostImpactByMonth: { month: string; total: number }[];
  byStatus: Record<string, number>;
}

interface ProjectAnalytics {
  rfis?: RfiAnalytics;
  punchList?: PunchListAnalytics;
  submittals?: SubmittalAnalytics;
  safety?: SafetyAnalytics;
  changeOrders?: ChangeOrderAnalytics;
}

function formatWeekLabel(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatDays(days: number | null, na: string): string {
  if (days === null) return na;
  return days.toFixed(1);
}

export default function ProjectAnalyticsPage() {
  const t = useTranslations("Analytics");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const currency = useProjectCurrency(params.id);

  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<ProjectAnalytics>(`/projects/${params.id}/analytics`)
      .then(setAnalytics)
      .catch((err) => {
        if (err instanceof ApiClientError && err.status === 403) setForbidden(true);
        else setError(tc("errorGeneric"));
      });
  }, [router, locale, params.id, tc]);

  if (forbidden) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <PageHeader title={t("title")} />
        <p className="text-navy-600">{t("forbidden")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title={t("title")} description={t("intro")} />
      {error && <p className="mb-4 text-maroon-700">{error}</p>}
      {!analytics && !error && <p className="text-sm text-navy-600">{tc("loading")}</p>}

      {analytics && (
        <div className="flex flex-col gap-6">
          {analytics.rfis && (
            <section className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <h2 className="mb-3 text-lg font-bold text-navy-900">{t("rfisHeading")}</h2>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div>
                  <TrendBarChart
                    data={analytics.rfis.createdVsAnsweredWeekly.map((w) => ({ label: w.weekStart, a: w.created, b: w.resolved }))}
                    seriesA={{ label: t("created"), color: "#8a2332" }}
                    seriesB={{ label: t("answered"), color: "#1f3564" }}
                    formatLabel={(l) => formatWeekLabel(l, locale)}
                  />
                  <p className="mt-2 text-xs text-navy-600">
                    {t("avgResponseTime")}: <span className="font-semibold text-navy-900">{formatDays(analytics.rfis.avgResponseTimeDays, t("noData"))}</span>{" "}
                    {analytics.rfis.avgResponseTimeDays !== null && t("days")}
                  </p>
                </div>
                <StatusBreakdown byStatus={analytics.rfis.byStatus} />
              </div>
            </section>
          )}

          {analytics.punchList && (
            <section className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <h2 className="mb-3 text-lg font-bold text-navy-900">{t("punchListHeading")}</h2>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div>
                  <TrendBarChart
                    data={analytics.punchList.createdVsClosedWeekly.map((w) => ({ label: w.weekStart, a: w.created, b: w.resolved }))}
                    seriesA={{ label: t("created"), color: "#8a2332" }}
                    seriesB={{ label: t("closed"), color: "#1f3564" }}
                    formatLabel={(l) => formatWeekLabel(l, locale)}
                  />
                  <p className="mt-2 text-xs text-navy-600">
                    {t("avgCycleTime")}:{" "}
                    <span className="font-semibold text-navy-900">{formatDays(analytics.punchList.avgCycleTimeDays, t("noData"))}</span>{" "}
                    {analytics.punchList.avgCycleTimeDays !== null && t("days")}
                  </p>
                </div>
                <StatusBreakdown byStatus={analytics.punchList.byStatus} />
              </div>
            </section>
          )}

          {analytics.submittals && (
            <section className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <h2 className="mb-3 text-lg font-bold text-navy-900">{t("submittalsHeading")}</h2>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div>
                  <TrendBarChart
                    data={analytics.submittals.createdVsResolvedWeekly.map((w) => ({ label: w.weekStart, a: w.created, b: w.resolved }))}
                    seriesA={{ label: t("created"), color: "#8a2332" }}
                    seriesB={{ label: t("resolved"), color: "#1f3564" }}
                    formatLabel={(l) => formatWeekLabel(l, locale)}
                  />
                  <p className="mt-2 text-xs text-navy-600">
                    {t("avgCycleTime")}:{" "}
                    <span className="font-semibold text-navy-900">{formatDays(analytics.submittals.avgCycleTimeDays, t("noData"))}</span>{" "}
                    {analytics.submittals.avgCycleTimeDays !== null && t("days")}
                  </p>
                </div>
                <StatusBreakdown byStatus={analytics.submittals.byStatus} />
              </div>
            </section>
          )}

          {analytics.safety && (
            <section className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <h2 className="mb-3 text-lg font-bold text-navy-900">{t("safetyHeading")}</h2>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div>
                  <TrendBarChart
                    data={analytics.safety.incidentsWeekly.map((w) => ({ label: w.weekStart, a: w.count, b: 0 }))}
                    seriesA={{ label: t("incidents"), color: "#8a2332" }}
                    seriesB={{ label: "", color: "transparent" }}
                    formatLabel={(l) => formatWeekLabel(l, locale)}
                  />
                  <p className="mt-2 text-xs text-navy-600">
                    {t("avgTimeToClose")}:{" "}
                    <span className="font-semibold text-navy-900">{formatDays(analytics.safety.avgTimeToCloseDays, t("noData"))}</span>{" "}
                    {analytics.safety.avgTimeToCloseDays !== null && t("days")}
                  </p>
                </div>
                <StatusBreakdown byStatus={analytics.safety.bySeverity} />
              </div>
            </section>
          )}

          {analytics.changeOrders && (
            <section className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <h2 className="mb-3 text-lg font-bold text-navy-900">{t("changeOrdersHeading")}</h2>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <MonthlyBarChart data={analytics.changeOrders.approvedCostImpactByMonth} formatValue={(n) => formatMoney(n, currency, locale)} />
                <StatusBreakdown byStatus={analytics.changeOrders.byStatus} />
              </div>
            </section>
          )}

          {!analytics.rfis && !analytics.punchList && !analytics.submittals && !analytics.safety && !analytics.changeOrders && (
            <p className="text-sm text-navy-600">{t("noSections")}</p>
          )}
        </div>
      )}
    </main>
  );
}
