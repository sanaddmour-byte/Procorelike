"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface ChecklistTemplate {
  id: string;
  title: string;
}

interface Inspection {
  id: string;
  templateId: string;
  status: "scheduled" | "in_progress" | "completed";
  scheduledAt: string | null;
}

function statusLabel(status: Inspection["status"], t: (key: string) => string): string {
  return { scheduled: t("statusScheduled"), in_progress: t("statusInProgress"), completed: t("statusCompleted") }[status];
}

export default function InspectionsPage() {
  const t = useTranslations("Inspections");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<Inspection[]>(`/inspections?projectId=${params.id}`)
      .then(setInspections)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<ChecklistTemplate[]>(`/checklist-templates?projectId=${params.id}`)
      .then((tpls) => {
        setTemplates(tpls);
        setTemplateId((current) => current || tpls[0]?.id || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function templateTitle(id: string): string {
    return templates.find((tpl) => tpl.id === id)?.title ?? id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!templateId) return;
    setCreating(true);
    try {
      await apiJson("/inspections", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          templateId,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      setScheduledAt("");
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
          <div className="flex gap-2">
            <Link href={`/${locale}/projects/${params.id}/inspections/templates`} className="rounded-lg border-3 border-ink px-3 py-2 text-sm text-navy-800">
              {t("manageTemplates")}
            </Link>
            <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white">
              {t("newButton")}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-white shadow-brutal-sm p-4">
            {templates.length === 0 ? (
              <p className="text-sm text-navy-600">{t("noTemplates")}</p>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  {t("template")}
                  <select required value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("scheduledDate")}
                  <input type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                </label>
                <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                  {t("create")}
                </button>
              </>
            )}
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!inspections && !error && <p>{tc("loading")}</p>}
        {inspections && inspections.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {inspections?.map((inspection) => (
            <li key={inspection.id}>
              <Link
                href={`/${locale}/projects/${params.id}/inspections/${inspection.id}`}
                className="block rounded-xl border-3 border-ink bg-white p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{templateTitle(inspection.templateId)}</span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                    {statusLabel(inspection.status, t)}
                  </span>
                </div>
                {inspection.scheduledAt && <p className="mt-1 text-sm text-navy-600">{inspection.scheduledAt.slice(0, 10)}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
