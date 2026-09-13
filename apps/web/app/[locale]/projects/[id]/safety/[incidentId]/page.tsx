"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import {
  SAFETY_INCIDENT_STATUS_TRANSITIONS,
  type SafetyIncidentSeverity,
  type SafetyIncidentStatus,
} from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface SafetyIncidentDetail {
  id: string;
  projectId: string;
  occurredAt: string;
  severity: SafetyIncidentSeverity;
  status: SafetyIncidentStatus;
  description: string;
  involvedCompanyId: string | null;
  injuredPersonName: string | null;
  correctiveAction: string | null;
  closedAt: string | null;
  reportedBy: string;
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

export default function SafetyIncidentDetailScreen() {
  const t = useTranslations("Safety");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; incidentId: string }>();

  const [incident, setIncident] = useState<SafetyIncidentDetail | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await apiJson<SafetyIncidentDetail[]>(`/safety-incidents?projectId=${params.id}`);
      const detail = rows.find((r) => r.id === params.incidentId) ?? null;
      setIncident(detail);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.id, params.incidentId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, load, params.id]);

  function companyName(id: string | null): string {
    if (!id) return t("unassigned");
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleTransition(toStatus: SafetyIncidentStatus): Promise<void> {
    setTransitioning(true);
    try {
      await apiJson(`/safety-incidents/${params.incidentId}/transition`, {
        method: "POST",
        body: JSON.stringify(toStatus === "closed" ? { toStatus, correctiveAction } : { toStatus }),
      });
      setCorrectiveAction("");
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTransitioning(false);
    }
  }

  if (!incident) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  const otherTransitions = SAFETY_INCIDENT_STATUS_TRANSITIONS[incident.status].filter((s) => s !== "closed");
  const canClose = SAFETY_INCIDENT_STATUS_TRANSITIONS[incident.status].includes("closed");

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/safety`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>

        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{severityLabel(incident.severity, t)}</h1>
          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(incident.status, t)}</span>
        </div>
        <p className="mb-4 text-sm text-navy-600">
          {incident.occurredAt.slice(0, 16).replace("T", " ")} · {companyName(incident.involvedCompanyId)}
          {incident.injuredPersonName && ` · ${incident.injuredPersonName}`}
        </p>
        {error && <p className="text-maroon-700">{error}</p>}

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          <p className="whitespace-pre-wrap">{incident.description}</p>
        </div>

        {incident.correctiveAction && (
          <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <h2 className="mb-2 text-sm font-medium text-navy-800">{t("correctiveAction")}</h2>
            <p className="whitespace-pre-wrap text-sm">{incident.correctiveAction}</p>
          </div>
        )}

        {otherTransitions.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-sm text-navy-600">{t("moveTo")}</p>
            <div className="flex flex-wrap gap-2">
              {otherTransitions.map((next) => (
                <button
                  key={next}
                  onClick={() => void handleTransition(next)}
                  disabled={transitioning}
                  className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {statusLabel(next, t)}
                </button>
              ))}
            </div>
          </div>
        )}

        {canClose && (
          <div className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <p className="mb-2 text-sm text-navy-600">{t("correctiveActionRequired")}</p>
            <textarea
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder={t("correctiveActionPlaceholder")}
              className="mb-3 w-full rounded-lg border-3 border-ink px-3 py-2 text-sm"
              rows={3}
            />
            <button
              onClick={() => void handleTransition("closed")}
              disabled={transitioning || !correctiveAction.trim()}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {t("closeWithAction")}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
