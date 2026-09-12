"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiFetch, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { uploadAttachment } from "@/lib/upload";
import type { ChecklistResponseType, InspectionResponseValue } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface TemplateItem {
  id: string;
  prompt: string;
  responseType: ChecklistResponseType;
  order: number;
}

interface InspectionResponse {
  id: string;
  templateItemId: string;
  value: InspectionResponseValue;
  generatedPunchItemId: string | null;
}

interface InspectionDetail {
  id: string;
  projectId: string;
  templateId: string;
  templateTitle: string;
  status: "scheduled" | "in_progress" | "completed";
  scheduledAt: string | null;
  performedBy: string | null;
  signedByName: string | null;
  signedAt: string | null;
  responses: InspectionResponse[];
}

function statusLabel(status: InspectionDetail["status"], t: (key: string) => string): string {
  return { scheduled: t("statusScheduled"), in_progress: t("statusInProgress"), completed: t("statusCompleted") }[status];
}

export default function InspectionDetailScreen() {
  const t = useTranslations("Inspections");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; inspectionId: string }>();

  const [inspection, setInspection] = useState<InspectionDetail | null>(null);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, InspectionResponseValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [signedByName, setSignedByName] = useState("");

  const load = useCallback(async () => {
    try {
      const detail = await apiJson<InspectionDetail>(`/inspections/${params.inspectionId}`);
      setInspection(detail);
      const template = await apiJson<{ items: TemplateItem[] }>(`/checklist-templates/${detail.templateId}`);
      setTemplateItems([...template.items].sort((a, b) => a.order - b.order));
      const nextDrafts: Record<string, InspectionResponseValue> = {};
      for (const response of detail.responses) nextDrafts[response.templateItemId] = response.value;
      setDrafts(nextDrafts);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.inspectionId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
  }, [router, locale, load]);

  function responseTypeLabel(type: ChecklistResponseType): string {
    return {
      pass_fail: t("responseTypePassFail"),
      na: t("responseTypeNa"),
      numeric: t("responseTypeNumeric"),
      photo: t("responseTypePhoto"),
      signature: t("responseTypeSignature"),
    }[type];
  }

  async function handleStart(): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/inspections/${params.inspectionId}/transition`, { method: "POST", body: JSON.stringify({ toStatus: "in_progress" }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  function setDraft(templateItemId: string, value: InspectionResponseValue): void {
    setDrafts((prev) => ({ ...prev, [templateItemId]: value }));
  }

  async function handlePhotoUpload(templateItemId: string, file: File): Promise<void> {
    if (!inspection) return;
    setUploadingItemId(templateItemId);
    try {
      const attachmentId = await uploadAttachment({
        projectId: inspection.projectId,
        ownerType: "inspection",
        ownerId: inspection.id,
        file,
      });
      setDraft(templateItemId, { type: "photo", attachmentId });
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setUploadingItemId(null);
    }
  }

  async function handleSaveAnswers(): Promise<void> {
    const responses = Object.entries(drafts).map(([templateItemId, value]) => ({ templateItemId, value }));
    if (responses.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/inspections/${params.inspectionId}/responses`, { method: "PATCH", body: JSON.stringify({ responses }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete(): Promise<void> {
    if (!signedByName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/inspections/${params.inspectionId}/complete`, {
        method: "POST",
        body: JSON.stringify({ signedByName: signedByName.trim() }),
      });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadReport(): Promise<void> {
    try {
      const res = await apiFetch(`/inspections/${params.inspectionId}/report`);
      if (!res.ok) throw new Error("report_failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  function responseByItem(templateItemId: string): InspectionResponse | undefined {
    return inspection?.responses.find((r) => r.templateItemId === templateItemId);
  }

  if (!inspection) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-red-600">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  const editable = inspection.status === "in_progress";

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/inspections`} className="mb-4 inline-block text-sm text-slate-500 underline">
          {t("back")}
        </Link>

        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{inspection.templateTitle}</h1>
          <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{statusLabel(inspection.status, t)}</span>
        </div>
        {inspection.scheduledAt && <p className="mb-4 text-sm text-slate-500">{inspection.scheduledAt.slice(0, 10)}</p>}
        {error && <p className="text-red-600">{error}</p>}

        {inspection.status === "scheduled" && (
          <button onClick={() => void handleStart()} disabled={busy} className="mb-6 rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            {t("start")}
          </button>
        )}

        {inspection.status !== "scheduled" && (
          <>
            <h2 className="mb-2 text-lg font-medium">{t("checklist")}</h2>
            <ul className="mb-6 flex flex-col gap-3">
              {templateItems.map((item) => {
                const draft = drafts[item.id];
                const response = responseByItem(item.id);
                return (
                  <li key={item.id} className="rounded border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{item.prompt}</span>
                      <span className="text-xs text-slate-400">{responseTypeLabel(item.responseType)}</span>
                    </div>

                    {item.responseType === "pass_fail" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => setDraft(item.id, { type: "pass_fail", passed: true })}
                          className={`rounded px-3 py-1 text-sm ${
                            draft?.type === "pass_fail" && draft.passed ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-700"
                          }`}
                        >
                          {t("pass")}
                        </button>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => setDraft(item.id, { type: "pass_fail", passed: false })}
                          className={`rounded px-3 py-1 text-sm ${
                            draft?.type === "pass_fail" && !draft.passed ? "bg-red-600 text-white" : "border border-slate-300 text-slate-700"
                          }`}
                        >
                          {t("fail")}
                        </button>
                      </div>
                    )}

                    {item.responseType === "na" && (
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => setDraft(item.id, { type: "na" })}
                        className={`rounded px-3 py-1 text-sm ${draft?.type === "na" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}
                      >
                        {t("na")}
                      </button>
                    )}

                    {item.responseType === "numeric" && (
                      <input
                        type="number"
                        disabled={!editable}
                        value={draft?.type === "numeric" ? draft.number : ""}
                        onChange={(e) => setDraft(item.id, { type: "numeric", number: Number(e.target.value) })}
                        placeholder={t("numberPlaceholder")}
                        className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    )}

                    {item.responseType === "photo" && (
                      <div className="flex items-center gap-2">
                        <label className={`cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 ${!editable ? "opacity-50" : ""}`}>
                          {uploadingItemId === item.id ? t("uploading") : t("photoUpload")}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={!editable || uploadingItemId === item.id}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handlePhotoUpload(item.id, file);
                            }}
                          />
                        </label>
                        {draft?.type === "photo" && <span className="text-xs text-emerald-700">✓</span>}
                      </div>
                    )}

                    {item.responseType === "signature" && (
                      <input
                        type="text"
                        disabled={!editable}
                        value={draft?.type === "signature" ? draft.signedByName : ""}
                        onChange={(e) => setDraft(item.id, { type: "signature", signedByName: e.target.value })}
                        placeholder={t("signaturePlaceholder")}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    )}

                    {response?.generatedPunchItemId && (
                      <Link
                        href={`/${locale}/projects/${params.id}/punch-list/${response.generatedPunchItemId}`}
                        className="mt-2 inline-block text-xs font-medium text-amber-700 underline"
                      >
                        {t("punchItemCreated")}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>

            {editable && (
              <button onClick={() => void handleSaveAnswers()} disabled={busy} className="mb-8 rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
                {t("saveAnswers")}
              </button>
            )}

            {editable && (
              <div className="mb-6 rounded border border-slate-200 p-4">
                <label className="mb-2 flex flex-col gap-1 text-sm">
                  {t("signedByName")}
                  <input
                    type="text"
                    value={signedByName}
                    onChange={(e) => setSignedByName(e.target.value)}
                    className="rounded border border-slate-300 px-3 py-2"
                  />
                </label>
                <button
                  onClick={() => void handleComplete()}
                  disabled={busy || !signedByName.trim()}
                  className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {t("completeInspection")}
                </button>
              </div>
            )}

            {inspection.status === "completed" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-slate-600">
                  {t("signedOffBy")}: <span className="font-medium">{inspection.signedByName}</span>
                  {inspection.signedAt && ` — ${inspection.signedAt.replace("T", " ").slice(0, 16)}`}
                </p>
                <button onClick={() => void handleDownloadReport()} className="self-start rounded bg-slate-900 px-3 py-2 text-sm text-white">
                  {t("downloadReport")}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
