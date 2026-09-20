"use client";

import { CorrectiveActionsPanel } from "@/components/CorrectiveActionsPanel";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterBar } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { StatusTone } from "@/lib/design/status";
import { useServerTable } from "@/lib/use-server-table";
import type { SafetyObservationCategory, SafetyObservationStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Member {
  userId: string;
  name: string;
}

interface SafetyObservation {
  id: string;
  observedAt: string;
  category: SafetyObservationCategory;
  status: SafetyObservationStatus;
  description: string;
}

function categoryLabel(category: SafetyObservationCategory, t: (key: string) => string): string {
  return {
    unsafe_condition: t("categoryUnsafeCondition"),
    unsafe_act: t("categoryUnsafeAct"),
    near_miss: t("categoryNearMiss"),
    good_catch: t("categoryGoodCatch"),
  }[category];
}

function statusLabel(status: SafetyObservationStatus, t: (key: string) => string): string {
  return { open: t("statusOpen"), resolved: t("statusResolved") }[status];
}

const STATUS_TONE: Record<SafetyObservationStatus, StatusTone> = {
  open: "warning",
  resolved: "success",
};

export default function SafetyObservationsPage() {
  const t = useTranslations("Safety");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [observedAt, setObservedAt] = useState("");
  const [category, setCategory] = useState<SafetyObservationCategory>("unsafe_condition");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const serverTable = useServerTable<SafetyObservation>({ basePath: "/safety-observations", projectId: params.id, defaultSort: { key: "observedAt", direction: "desc" } });

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [router, locale, params.id]);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/safety-observations", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          observedAt: new Date(observedAt).toISOString(),
          category,
          description,
        }),
      });
      setObservedAt("");
      setCategory("unsafe_condition");
      setDescription("");
      setShowForm(false);
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string): Promise<void> {
    setTogglingId(id);
    try {
      await apiJson(`/safety-observations/${id}/toggle-resolved`, { method: "POST" });
      serverTable.reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTogglingId(null);
    }
  }

  const hasActiveQuery = Boolean(serverTable.search) || Object.values(serverTable.filters).some(Boolean);
  const pageCount = Math.max(1, Math.ceil(serverTable.total / serverTable.pageSize));

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader
          title={t("title")}
          actions={
            <Link
              href={`/${locale}/projects/${params.id}/safety`}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-white to-cream brutal-interactive px-3 py-2 text-sm text-navy-800"
            >
              {t("incidentsTab")}
            </Link>
          }
        />

        <div className="mb-4 flex gap-2 border-b-3 border-ink">
          <span className="border-b-4 border-maroon-600 px-3 py-2 text-sm font-semibold text-maroon-700">{t("observationsTab")}</span>
        </div>

        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("newObservation")}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4"
          >
            <label className="flex flex-col gap-1 text-sm">
              {t("observedAt")}
              <input
                type="datetime-local"
                required
                value={observedAt}
                onChange={(e) => setObservedAt(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("category")}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SafetyObservationCategory)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="unsafe_condition">{t("categoryUnsafeCondition")}</option>
                <option value="unsafe_act">{t("categoryUnsafeAct")}</option>
                <option value="near_miss">{t("categoryNearMiss")}</option>
                <option value="good_catch">{t("categoryGoodCatch")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("description")}
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
                rows={3}
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}

        {/* No SavedViewsBar here: Safety Observations shares the "safety" permission Module
            with Safety Incidents (see safety.service.ts's requirePermission calls), and that
            same Module is what SavedViewsBar's saved-view rows are scoped by -- adding a second
            SavedViewsBar on this page with module="safety" would let a view saved here be
            offered on the Incidents page (and vice versa), even though their sort-key enums
            differ (this page has no "severity" key; Incidents has no "category" key). Deferred,
            same reasoning as Transmittals in Phase 24. */}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterBar
            searchValue={serverTable.search}
            onSearchChange={serverTable.onSearchChange}
            searchPlaceholder={t("searchPlaceholder")}
            filters={[
              {
                key: "status",
                label: t("status"),
                options: (["open", "resolved"] as const).map((s) => ({ value: s, label: statusLabel(s, t) })),
              },
            ]}
            activeFilters={serverTable.filters}
            onFilterChange={serverTable.onFilterChange}
            onClearAll={serverTable.clearAll}
            clearAllLabel={tc("clearAll")}
          />
          {/* No table header to click here (this page renders a card list, not DataTable) --
              a plain sort control drives useServerTable's onServerSortChange the same way a
              column header would elsewhere. */}
          <select
            value={serverTable.sort?.key ?? ""}
            onChange={(e) => e.target.value && serverTable.onServerSortChange(e.target.value)}
            className="rounded-lg border-3 border-ink px-2 py-1.5 text-sm"
            aria-label={t("sortBy")}
          >
            <option value="observedAt">{t("sortByObservedAt")}</option>
            <option value="description">{t("sortByDescription")}</option>
            <option value="category">{t("sortByCategory")}</option>
            <option value="status">{t("sortByStatus")}</option>
          </select>
        </div>

        {serverTable.error && <ErrorState message={tc("errorGeneric")} onRetry={serverTable.reload} retryLabel={tc("retry")} />}
        {!serverTable.rows && !serverTable.error && <p>{tc("loading")}</p>}
        {serverTable.rows && serverTable.rows.length === 0 && (
          <p className="text-navy-600">{hasActiveQuery ? t("noResultsObservations") : t("emptyObservations")}</p>
        )}
        <ul className="flex flex-col gap-3">
          {serverTable.rows?.map((obs) => (
            <li
              key={obs.id}
              className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{categoryLabel(obs.category, t)}</span>
                <StatusBadge tone={STATUS_TONE[obs.status]} label={statusLabel(obs.status, t)} />
              </div>
              <p className="mt-1 text-sm text-navy-700">{obs.description}</p>
              <p className="mt-1 text-xs text-navy-600">{obs.observedAt.slice(0, 16).replace("T", " ")}</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void handleToggle(obs.id)}
                  disabled={togglingId === obs.id}
                  className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  {obs.status === "open" ? t("resolve") : t("reopen")}
                </button>
                <button
                  onClick={() => setExpandedId(expandedId === obs.id ? null : obs.id)}
                  className="rounded-lg border-3 border-ink bg-white px-3 py-1.5 text-xs font-semibold text-navy-800"
                >
                  {t("correctiveActionsToggle")}
                </button>
              </div>
              {expandedId === obs.id && (
                <div className="mt-3">
                  <CorrectiveActionsPanel projectId={params.id} sourceType="safety_observation" sourceId={obs.id} members={members} />
                </div>
              )}
            </li>
          ))}
        </ul>

        {serverTable.rows && serverTable.rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-3 border-ink bg-cream px-3 py-2">
            <button
              type="button"
              onClick={() => serverTable.onPageChange(serverTable.page - 1)}
              disabled={serverTable.page <= 1}
              aria-label={tc("previousPage")}
              className="rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-sm font-semibold text-navy-800 disabled:opacity-40"
            >
              &#8249;
            </button>
            <span className="whitespace-nowrap text-xs font-semibold text-navy-700">{tc("pageIndicator", { current: serverTable.page, total: pageCount })}</span>
            <button
              type="button"
              onClick={() => serverTable.onPageChange(serverTable.page + 1)}
              disabled={serverTable.page >= pageCount}
              aria-label={tc("nextPage")}
              className="rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-sm font-semibold text-navy-800 disabled:opacity-40"
            >
              &#8250;
            </button>
          </div>
        )}
      </main>
    </>
  );
}
