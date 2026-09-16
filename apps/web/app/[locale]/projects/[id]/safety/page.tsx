"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { InjuryIllnessType, OshaClassification, SafetyIncidentSeverity, SafetyIncidentStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface SafetySummary {
  incidentsBySeverity: Record<string, number>;
  incidentsByStatus: Record<string, number>;
  observationsByCategory: Record<string, number>;
  observationsByStatus: Record<string, number>;
  oshaRecordableCount: number;
  totalDaysAwayFromWork: number;
  totalDaysJobTransferOrRestriction: number;
}

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
  const [summary, setSummary] = useState<SafetySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [occurredAt, setOccurredAt] = useState("");
  const [severity, setSeverity] = useState<SafetyIncidentSeverity>("near_miss");
  const [description, setDescription] = useState("");
  const [involvedCompanyId, setInvolvedCompanyId] = useState("");
  const [injuredPersonName, setInjuredPersonName] = useState("");
  const [oshaClassification, setOshaClassification] = useState<OshaClassification>("not_recordable");
  const [injuryIllnessType, setInjuryIllnessType] = useState<InjuryIllnessType>("injury");
  const [bodyPart, setBodyPart] = useState("");
  const [daysAwayFromWork, setDaysAwayFromWork] = useState("0");
  const [daysJobTransferOrRestriction, setDaysJobTransferOrRestriction] = useState("0");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<SafetyIncident[]>(`/safety-incidents?projectId=${params.id}`)
      .then(setIncidents)
      .catch(() => setError(tc("errorGeneric")));
    apiJson<SafetySummary>(`/safety-incidents/summary?projectId=${params.id}`).then(setSummary).catch(() => undefined);
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
          oshaClassification,
          injuryIllnessType: oshaClassification !== "not_recordable" ? injuryIllnessType : undefined,
          bodyPart: oshaClassification !== "not_recordable" ? bodyPart || undefined : undefined,
          daysAwayFromWork: Number(daysAwayFromWork) || 0,
          daysJobTransferOrRestriction: Number(daysJobTransferOrRestriction) || 0,
        }),
      });
      setOccurredAt("");
      setSeverity("near_miss");
      setDescription("");
      setInvolvedCompanyId("");
      setInjuredPersonName("");
      setOshaClassification("not_recordable");
      setInjuryIllnessType("injury");
      setBodyPart("");
      setDaysAwayFromWork("0");
      setDaysJobTransferOrRestriction("0");
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
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
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

        {summary && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border-2 border-ink bg-white p-3 text-center">
              <div className="text-2xl font-extrabold text-navy-900">{summary.oshaRecordableCount}</div>
              <div className="text-xs text-navy-600">{t("summaryRecordable")}</div>
            </div>
            <div className="rounded-lg border-2 border-ink bg-white p-3 text-center">
              <div className="text-2xl font-extrabold text-navy-900">{summary.totalDaysAwayFromWork}</div>
              <div className="text-xs text-navy-600">{t("summaryDaysAway")}</div>
            </div>
            <div className="rounded-lg border-2 border-ink bg-white p-3 text-center">
              <div className="text-2xl font-extrabold text-navy-900">{summary.incidentsByStatus.open ?? 0}</div>
              <div className="text-xs text-navy-600">{t("summaryOpenIncidents")}</div>
            </div>
            <div className="rounded-lg border-2 border-ink bg-white p-3 text-center">
              <div className="text-2xl font-extrabold text-navy-900">{summary.observationsByStatus.open ?? 0}</div>
              <div className="text-xs text-navy-600">{t("summaryOpenObservations")}</div>
            </div>
          </div>
        )}

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
            <label className="flex flex-col gap-1 text-sm">
              {t("oshaClassification")}
              <select
                value={oshaClassification}
                onChange={(e) => setOshaClassification(e.target.value as OshaClassification)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                <option value="not_recordable">{t("oshaClass_not_recordable")}</option>
                <option value="death">{t("oshaClass_death")}</option>
                <option value="days_away_from_work">{t("oshaClass_days_away_from_work")}</option>
                <option value="job_transfer_or_restriction">{t("oshaClass_job_transfer_or_restriction")}</option>
                <option value="other_recordable">{t("oshaClass_other_recordable")}</option>
              </select>
            </label>
            {oshaClassification !== "not_recordable" && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  {t("injuryIllnessType")}
                  <select
                    value={injuryIllnessType}
                    onChange={(e) => setInjuryIllnessType(e.target.value as InjuryIllnessType)}
                    className="rounded-lg border-3 border-ink px-3 py-2"
                  >
                    <option value="injury">{t("injuryType_injury")}</option>
                    <option value="skin_disorder">{t("injuryType_skin_disorder")}</option>
                    <option value="respiratory_condition">{t("injuryType_respiratory_condition")}</option>
                    <option value="poisoning">{t("injuryType_poisoning")}</option>
                    <option value="hearing_loss">{t("injuryType_hearing_loss")}</option>
                    <option value="other_illness">{t("injuryType_other_illness")}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("bodyPart")}
                  <input value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("daysAwayFromWork")}
                  <input
                    type="number"
                    min={0}
                    value={daysAwayFromWork}
                    onChange={(e) => setDaysAwayFromWork(e.target.value)}
                    className="rounded-lg border-3 border-ink px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("daysJobTransferOrRestriction")}
                  <input
                    type="number"
                    min={0}
                    value={daysJobTransferOrRestriction}
                    onChange={(e) => setDaysJobTransferOrRestriction(e.target.value)}
                    className="rounded-lg border-3 border-ink px-3 py-2"
                  />
                </label>
              </>
            )}
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
