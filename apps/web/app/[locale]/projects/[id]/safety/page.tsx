"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { SafetyIncidentSeverity, SafetyIncidentStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface SafetyIncident {
  id: string;
  occurredAt: string;
  severity: SafetyIncidentSeverity;
  status: SafetyIncidentStatus;
  description: string;
  involvedCompanyId: string | null;
}

interface ProjectCompany {
  companyId: string;
  name: string;
}

function severityLabel(severity: SafetyIncidentSeverity, t: (key: string) => string): string {
  return {
    near_miss: t("severityNearMiss"),
    minor: t("severityMinor"),
    serious: t("severitySerious"),
    critical: t("severityCritical"),
  }[severity];
}

function statusLabel(status: SafetyIncidentStatus, t: (key: string) => string): string {
  return { open: t("statusOpen"), investigating: t("statusInvestigating"), closed: t("statusClosed") }[status];
}

export default function SafetyIncidentsPage() {
  const t = useTranslations("Safety");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [incidents, setIncidents] = useState<SafetyIncident[] | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [occurredAt, setOccurredAt] = useState("");
  const [severity, setSeverity] = useState<SafetyIncidentSeverity>("near_miss");
  const [description, setDescription] = useState("");
  const [involvedCompanyId, setInvolvedCompanyId] = useState("");
  const [injuredPersonName, setInjuredPersonName] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<SafetyIncident[]>(`/safety-incidents?projectId=${params.id}`)
      .then(setIncidents)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string | null): string {
    if (!id) return t("unassigned");
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/safety-incidents", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          occurredAt: new Date(occurredAt).toISOString(),
          severity,
          description,
          involvedCompanyId: involvedCompanyId || undefined,
          injuredPersonName: injuredPersonName || undefined,
        }),
      });
      setOccurredAt("");
      setSeverity("near_miss");
      setDescription("");
      setInvolvedCompanyId("");
      setInjuredPersonName("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <Link
            href={`/${locale}/projects/${params.id}/safety/observations`}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-white to-cream brutal-interactive px-3 py-2 text-sm text-navy-800"
          >
            {t("observationsTab")}
          </Link>
        </div>

        <div className="mb-4 flex gap-2 border-b-3 border-ink">
          <span className="border-b-4 border-maroon-600 px-3 py-2 text-sm font-semibold text-maroon-700">{t("incidentsTab")}</span>
        </div>

        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("newIncident")}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4"
          >
            <label className="flex flex-col gap-1 text-sm">
              {t("occurredAt")}
              <input
                type="datetime-local"
                required
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("severity")}
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SafetyIncidentSeverity)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="near_miss">{t("severityNearMiss")}</option>
                <option value="minor">{t("severityMinor")}</option>
                <option value="serious">{t("severitySerious")}</option>
                <option value="critical">{t("severityCritical")}</option>
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
            <label className="flex flex-col gap-1 text-sm">
              {t("involvedCompany")}
              <select
                value={involvedCompanyId}
                onChange={(e) => setInvolvedCompanyId(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="">{t("unassigned")}</option>
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("injuredPersonName")}
              <input
                value={injuredPersonName}
                onChange={(e) => setInjuredPersonName(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
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
        {!incidents && !error && <p>{tc("loading")}</p>}
        {incidents && incidents.length === 0 && <p className="text-navy-600">{t("emptyIncidents")}</p>}
        <ul className="flex flex-col gap-3">
          {incidents?.map((incident) => (
            <li key={incident.id}>
              <Link
                href={`/${locale}/projects/${params.id}/safety/${incident.id}`}
                className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{incident.description.slice(0, 80)}</span>
                  <div className="flex shrink-0 gap-2">
                    <span className="whitespace-nowrap rounded bg-maroon-100 px-2 py-0.5 text-xs text-maroon-800">
                      {severityLabel(incident.severity, t)}
                    </span>
                    <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                      {statusLabel(incident.status, t)}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-navy-600">
                  {incident.occurredAt.slice(0, 10)} · {companyName(incident.involvedCompanyId)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
