"use client";

import { Header } from "@/components/Header";
import { PdfViewerModal } from "@/components/PdfViewerModal";
import { PersonnelPicker } from "@/components/PersonnelPicker";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { usePdfViewer } from "@/lib/use-pdf-viewer";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface SpecSection {
  id: string;
  csiCode: string;
  title: string;
}

interface Submittal {
  id: string;
  number: string;
  title: string;
  status: "draft" | "in_review" | "approved" | "closed";
  ballInCourtUserId: string | null;
}

interface Member {
  userId: string;
  name: string;
}

function statusLabel(status: Submittal["status"], t: (key: string) => string): string {
  return { draft: t("statusDraft"), in_review: t("statusInReview"), approved: t("statusApproved"), closed: t("statusClosed") }[status];
}

export default function SubmittalsPage() {
  const t = useTranslations("Submittals");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [submittals, setSubmittals] = useState<Submittal[] | null>(null);
  const [specSections, setSpecSections] = useState<SpecSection[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [specSectionId, setSpecSectionId] = useState("");
  const [title, setTitle] = useState("");
  const [distributionUserIds, setDistributionUserIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const pdfViewer = usePdfViewer();

  function load(): void {
    apiJson<Submittal[]>(`/submittals?projectId=${params.id}`)
      .then(setSubmittals)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<SpecSection[]>(`/submittals/spec-sections?projectId=${params.id}`)
      .then((sections) => {
        setSpecSections(sections);
        setSpecSectionId((current) => current || sections[0]?.id || "");
      })
      .catch(() => undefined);
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [router, locale, params.id]);

  function memberName(userId: string | null): string {
    if (!userId) return t("unassigned");
    return members.find((m) => m.userId === userId)?.name ?? userId;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!specSectionId) return;
    setCreating(true);
    try {
      await apiJson("/submittals", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, specSectionId, title, distributionUserIds }),
      });
      setTitle("");
      setDistributionUserIds([]);
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
            <button
              onClick={() => void pdfViewer.openPdf(`/submittals/summary-report?projectId=${params.id}`, t("title"), "submittal-register.pdf")}
              className="rounded-lg border-3 border-ink bg-gradient-to-b from-navy-600 to-navy-800 brutal-interactive px-3 py-2 text-sm font-semibold text-white"
            >
              {tc("exportAllPdf")}
            </button>
            <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
              {t("newButton")}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("specSection")}
              <select
                required
                value={specSectionId}
                onChange={(e) => setSpecSectionId(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              >
                {specSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.csiCode} — {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("submittalTitle")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <PersonnelPicker label={t("distribution")} members={members} selectedUserIds={distributionUserIds} onChange={setDistributionUserIds} />
            <button type="submit" disabled={creating || !specSectionId} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!submittals && !error && <p>{tc("loading")}</p>}
        {submittals && submittals.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {submittals?.map((s) => (
            <li key={s.id}>
              <Link
                href={`/${locale}/projects/${params.id}/submittals/${s.id}`}
                className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {s.number} — {s.title}
                  </span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(s.status, t)}</span>
                </div>
                <p className="mt-1 text-sm text-navy-600">
                  {t("ballInCourt")}: {memberName(s.ballInCourtUserId)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <PdfViewerModal open={pdfViewer.open} data={pdfViewer.data} error={pdfViewer.error} title={pdfViewer.title} fileName={pdfViewer.fileName} onClose={pdfViewer.close} />
    </>
  );
}
