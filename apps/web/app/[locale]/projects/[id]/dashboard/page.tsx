"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ActionRequiredType = "rfi_overdue" | "submittal_in_review" | "schedule_task_delayed" | "change_order_pending_approval";

interface ActionRequiredItem {
  type: ActionRequiredType;
  count: number;
}

interface Dashboard {
  rfis?: { total: number; open: number; overdue: number };
  punchList?: { total: number; byStatus: Record<string, number> };
  budget?: { revisedTotal: number; projectedTotal: number; varianceTotal: number };
  changeOrders?: { total: number; byStatus: Record<string, number> };
  actionRequired: ActionRequiredItem[];
}

const ACTION_LINKS: Record<ActionRequiredType, string> = {
  rfi_overdue: "rfis",
  submittal_in_review: "submittals",
  schedule_task_delayed: "schedule",
  change_order_pending_approval: "change-orders",
};

const ACTION_LABEL_KEYS: Record<ActionRequiredType, string> = {
  rfi_overdue: "actionRfiOverdue",
  submittal_in_review: "actionSubmittalInReview",
  schedule_task_delayed: "actionScheduleTaskDelayed",
  change_order_pending_approval: "actionChangeOrderPendingApproval",
};

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
      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageHeader title={t("title")} />
        {error && <p className="text-maroon-700">{error}</p>}
        {!dashboard && !error && <p>{tc("loading")}</p>}

        {dashboard && (
          <div className="flex flex-col gap-6">
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("actionRequiredTitle")}</h2>
              {dashboard.actionRequired.length === 0 ? (
                <div className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-5 text-sm text-navy-600">
                  {t("allClear")}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dashboard.actionRequired.map((item) => (
                    <li
                      key={item.type}
                      className="flex items-center justify-between gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4"
                    >
                      <div className="flex items-center gap-3">
                        <StatusBadge tone="warning" label={String(item.count)} />
                        <span className="font-medium text-navy-900">{t(ACTION_LABEL_KEYS[item.type], { count: item.count })}</span>
                      </div>
                      <button
                        onClick={() => router.push(`/${locale}/projects/${params.id}/${ACTION_LINKS[item.type]}`)}
                        className="shrink-0 rounded-lg border-3 border-ink px-3 py-1.5 text-sm font-semibold text-navy-800 brutal-interactive"
                      >
                        {t("review")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("kpisTitle")}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {dashboard.rfis && (
                  <div className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal p-5">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("rfis")}</h3>
                    <div className="flex gap-6">
                      <Tile label={t("rfisTotal")} value={dashboard.rfis.total} />
                      <Tile label={t("rfisOpen")} value={dashboard.rfis.open} />
                      <Tile label={t("rfisOverdue")} value={dashboard.rfis.overdue} accent="maroon" />
                    </div>
                  </div>
                )}

                {dashboard.punchList && (
                  <div className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal p-5">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("punchList")}</h3>
                    <div className="flex flex-wrap gap-6">
                      {Object.entries(dashboard.punchList.byStatus).map(([status, count]) => (
                        <Tile key={status} label={status} value={count} />
                      ))}
                    </div>
                  </div>
                )}

                {dashboard.budget && (
                  <div className="rounded-xl border-3 border-ink bg-orange-50 shadow-brutal p-5">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("budget")}</h3>
                    <div className="flex flex-wrap gap-6">
                      <MoneyTile label={t("budgetRevised")} value={dashboard.budget.revisedTotal} />
                      <MoneyTile label={t("budgetProjected")} value={dashboard.budget.projectedTotal} />
                      <MoneyTile label={t("budgetVariance")} value={dashboard.budget.varianceTotal} accent={dashboard.budget.varianceTotal < 0 ? "maroon" : undefined} />
                    </div>
                  </div>
                )}

                {dashboard.changeOrders && (
                  <div className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal p-5">
                    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-700">{t("changeOrders")}</h3>
                    <div className="flex flex-wrap gap-6">
                      {Object.entries(dashboard.changeOrders.byStatus).map(([status, count]) => (
                        <Tile key={status} label={status} value={count} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
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
