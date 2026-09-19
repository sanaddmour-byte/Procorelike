"use client";

import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import type { PrequalificationStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

interface Company {
  id: string;
  name: string;
}

interface Prequalification {
  id: string;
  companyId: string;
  status: PrequalificationStatus;
  bondingCapacity: string | null;
  experienceModRate: string | null;
  annualRevenue: string | null;
  yearsInBusiness: string | null;
  referencesText: string | null;
  overallScore: string | null;
  reviewNotes: string | null;
}

const NEXT_STATUS: Record<PrequalificationStatus, PrequalificationStatus[]> = {
  invited: ["submitted"],
  submitted: ["under_review"],
  under_review: ["qualified", "disqualified"],
  qualified: [],
  disqualified: ["under_review"],
};

function money(value: string | null): string {
  if (value === null) return "—";
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_TONE: Record<PrequalificationStatus, StatusTone> = {
  invited: "neutral",
  submitted: "info",
  under_review: "warning",
  qualified: "success",
  disqualified: "danger",
};

export default function PrequalificationPage() {
  const t = useTranslations("Prequalification");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [items, setItems] = useState<Prequalification[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [submitDrafts, setSubmitDrafts] = useState<
    Record<string, { bondingCapacity: string; experienceModRate: string; annualRevenue: string; yearsInBusiness: string; referencesText: string }>
  >({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { overallScore: string; reviewNotes: string }>>({});

  function load(): void {
    apiJson<Prequalification[]>(`/prequalifications?projectId=${params.id}`)
      .then(setItems)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<Company[]>(`/companies`)
      .then((rows) => {
        setCompanies(rows);
        setCompanyId((current) => current || rows[0]?.id || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.id === id)?.name ?? id;
  }

  function statusLabel(status: PrequalificationStatus): string {
    return {
      invited: t("statusInvited"),
      submitted: t("statusSubmitted"),
      under_review: t("statusUnderReview"),
      qualified: t("statusQualified"),
      disqualified: t("statusDisqualified"),
    }[status];
  }

  async function handleInvite(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!companyId) return;
    setInviting(true);
    try {
      await apiJson("/prequalifications", { method: "POST", body: JSON.stringify({ projectId: params.id, companyId }) });
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setInviting(false);
    }
  }

  async function handleSubmit(id: string): Promise<void> {
    const draft = submitDrafts[id] ?? { bondingCapacity: "", experienceModRate: "", annualRevenue: "", yearsInBusiness: "", referencesText: "" };
    setBusyId(id);
    try {
      await apiJson(`/prequalifications/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          bondingCapacity: draft.bondingCapacity ? Number(draft.bondingCapacity) : undefined,
          experienceModRate: draft.experienceModRate ? Number(draft.experienceModRate) : undefined,
          annualRevenue: draft.annualRevenue ? Number(draft.annualRevenue) : undefined,
          yearsInBusiness: draft.yearsInBusiness ? Number(draft.yearsInBusiness) : undefined,
          referencesText: draft.referencesText || undefined,
        }),
      });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleTransition(id: string, toStatus: PrequalificationStatus): Promise<void> {
    const review = reviewDrafts[id] ?? { overallScore: "", reviewNotes: "" };
    setBusyId(id);
    try {
      await apiJson(`/prequalifications/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({
          toStatus,
          overallScore: toStatus === "qualified" || toStatus === "disqualified" ? Number(review.overallScore || 0) : undefined,
          reviewNotes: toStatus === "qualified" || toStatus === "disqualified" ? review.reviewNotes || undefined : undefined,
        }),
      });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusyId(null);
    }
  }

  const filteredItems = useMemo(() => {
    if (!items) return null;
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (q && !companyName(item.companyId).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, companies, search, statusFilter]);

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <button
              onClick={() => setShowForm((s) => !s)}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
            >
              {t("newButton")}
            </button>
          }
        />

        {showForm && (
          <form onSubmit={(e) => void handleInvite(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("company")}
              <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={inviting} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("invite")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("searchPlaceholder")}
          filters={[
            {
              key: "status",
              label: t("status"),
              options: (["invited", "submitted", "under_review", "qualified", "disqualified"] as const).map((s) => ({ value: s, label: statusLabel(s) })),
            },
          ]}
          activeFilters={{ status: statusFilter }}
          onFilterChange={(_key, value) => setStatusFilter(value)}
          onClearAll={() => {
            setSearch("");
            setStatusFilter("");
          }}
          clearAllLabel={tc("clearAll")}
        />

        {!items && !error && <p>{tc("loading")}</p>}
        {items && items.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        {items && items.length > 0 && filteredItems && filteredItems.length === 0 && <p className="text-navy-600">{t("noResults")}</p>}

        <div className="flex flex-col gap-3">
          {filteredItems?.map((item) => {
            const draft = submitDrafts[item.id] ?? { bondingCapacity: "", experienceModRate: "", annualRevenue: "", yearsInBusiness: "", referencesText: "" };
            const review = reviewDrafts[item.id] ?? { overallScore: "", reviewNotes: "" };
            return (
              <div key={item.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-bold text-navy-900">{companyName(item.companyId)}</span>
                  <StatusBadge tone={STATUS_TONE[item.status]} label={statusLabel(item.status)} />
                </div>

                {item.status !== "invited" && (
                  <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                    <div>
                      <div className="text-navy-600">{t("bondingCapacity")}</div>
                      <div className="font-medium">{money(item.bondingCapacity)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("experienceModRate")}</div>
                      <div className="font-medium">{item.experienceModRate ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("annualRevenue")}</div>
                      <div className="font-medium">{money(item.annualRevenue)}</div>
                    </div>
                    <div>
                      <div className="text-navy-600">{t("yearsInBusiness")}</div>
                      <div className="font-medium">{item.yearsInBusiness ?? "—"}</div>
                    </div>
                    {item.overallScore !== null && (
                      <div>
                        <div className="text-navy-600">{t("overallScore")}</div>
                        <div className="font-bold">{item.overallScore}</div>
                      </div>
                    )}
                  </div>
                )}

                {item.status === "invited" && (
                  <div className="mt-2 flex flex-col gap-2 border-t-2 border-orange-200 pt-2">
                    <p className="text-xs font-semibold text-navy-700">{t("submitPrompt")}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input
                        type="number"
                        placeholder={t("bondingCapacity")}
                        value={draft.bondingCapacity}
                        onChange={(e) => setSubmitDrafts((prev) => ({ ...prev, [item.id]: { ...draft, bondingCapacity: e.target.value } }))}
                        className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder={t("experienceModRate")}
                        value={draft.experienceModRate}
                        onChange={(e) => setSubmitDrafts((prev) => ({ ...prev, [item.id]: { ...draft, experienceModRate: e.target.value } }))}
                        className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        placeholder={t("annualRevenue")}
                        value={draft.annualRevenue}
                        onChange={(e) => setSubmitDrafts((prev) => ({ ...prev, [item.id]: { ...draft, annualRevenue: e.target.value } }))}
                        className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        placeholder={t("yearsInBusiness")}
                        value={draft.yearsInBusiness}
                        onChange={(e) => setSubmitDrafts((prev) => ({ ...prev, [item.id]: { ...draft, yearsInBusiness: e.target.value } }))}
                        className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
                      />
                    </div>
                    <textarea
                      placeholder={t("referencesText")}
                      value={draft.referencesText}
                      onChange={(e) => setSubmitDrafts((prev) => ({ ...prev, [item.id]: { ...draft, referencesText: e.target.value } }))}
                      className="rounded-lg border-2 border-ink px-2 py-1 text-sm"
                      rows={2}
                    />
                    <button
                      onClick={() => void handleSubmit(item.id)}
                      disabled={busyId === item.id}
                      className="self-start rounded border-2 border-ink bg-navy-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {t("submit")}
                    </button>
                  </div>
                )}

                {item.status === "under_review" && (
                  <div className="mt-2 flex flex-col gap-2 border-t-2 border-orange-200 pt-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder={t("overallScore")}
                        value={review.overallScore}
                        onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [item.id]: { ...review, overallScore: e.target.value } }))}
                        className="w-32 rounded-lg border-2 border-ink px-2 py-1 text-sm"
                      />
                      <input
                        placeholder={t("reviewNotes")}
                        value={review.reviewNotes}
                        onChange={(e) => setReviewDrafts((prev) => ({ ...prev, [item.id]: { ...review, reviewNotes: e.target.value } }))}
                        className="flex-1 rounded-lg border-2 border-ink px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleTransition(item.id, "qualified")}
                        disabled={busyId === item.id}
                        className="rounded border-2 border-ink bg-navy-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t("markQualified")}
                      </button>
                      <button
                        onClick={() => void handleTransition(item.id, "disqualified")}
                        disabled={busyId === item.id}
                        className="rounded border-2 border-ink px-2 py-1 text-xs font-semibold text-navy-800 disabled:opacity-50"
                      >
                        {t("markDisqualified")}
                      </button>
                    </div>
                  </div>
                )}

                {NEXT_STATUS[item.status].length > 0 && item.status !== "invited" && item.status !== "under_review" && (
                  <div className="mt-2 flex gap-2 border-t-2 border-orange-200 pt-2">
                    {NEXT_STATUS[item.status].map((next) => (
                      <button
                        key={next}
                        onClick={() => void handleTransition(item.id, next)}
                        disabled={busyId === item.id}
                        className="rounded border-2 border-ink bg-navy-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {statusLabel(next)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
