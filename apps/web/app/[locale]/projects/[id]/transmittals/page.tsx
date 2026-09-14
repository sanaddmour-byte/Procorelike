"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

interface Transmittal {
  id: string;
  transmittalNumber: string;
  subject: string;
  purpose: string;
  status: "draft" | "sent";
  sentAt: string | null;
}

interface DocumentRecord {
  id: string;
  title: string;
}

interface Drawing {
  id: string;
  sheetNumber: string;
  title: string;
  currentRevisionId: string | null;
}

interface Member {
  userId: string;
  name: string;
  companyId: string;
  companyName: string;
}

interface DirectoryCompany {
  companyId: string;
  name: string;
}

const PURPOSES = ["for_review", "for_approval", "for_information", "as_requested", "for_construction", "for_bid"] as const;

export default function TransmittalsPage() {
  const t = useTranslations("Transmittals");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [transmittals, setTransmittals] = useState<Transmittal[] | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [companies, setCompanies] = useState<DirectoryCompany[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]>("for_review");
  const [message, setMessage] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function reload(): void {
    apiJson<Transmittal[]>(`/transmittals?projectId=${params.id}`)
      .then(setTransmittals)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    reload();
    apiJson<DocumentRecord[]>(`/documents?projectId=${params.id}`).then(setDocuments).catch(() => undefined);
    apiJson<Drawing[]>(`/drawings?projectId=${params.id}`).then(setDrawings).catch(() => undefined);
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
    apiJson<DirectoryCompany[]>(`/projects/${params.id}/directory-companies`).then(setCompanies).catch(() => undefined);
  }, [router, locale, params.id]);

  function toggle(list: string[], setList: (v: string[]) => void, id: string): void {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const items = [
        ...selectedDocumentIds.map((id) => ({
          itemType: "document" as const,
          itemId: id,
          description: documents.find((d) => d.id === id)?.title ?? "Document",
        })),
        ...selectedDrawingIds
          .map((id) => drawings.find((d) => d.id === id))
          .filter((d): d is Drawing => Boolean(d?.currentRevisionId))
          .map((d) => ({
            itemType: "drawing_revision" as const,
            itemId: d.currentRevisionId as string,
            description: `${d.sheetNumber} — ${d.title}`,
          })),
      ];
      const recipients = [
        ...selectedUserIds.map((userId) => ({ userId })),
        ...selectedCompanyIds.map((companyId) => ({ companyId })),
      ];
      await apiJson("/transmittals", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, subject, purpose, message: message || undefined, items, recipients }),
      });
      setShowForm(false);
      setSubject("");
      setMessage("");
      setSelectedDocumentIds([]);
      setSelectedDrawingIds([]);
      setSelectedUserIds([]);
      setSelectedCompanyIds([]);
      reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = subject.trim().length > 0 && (selectedDocumentIds.length > 0 || selectedDrawingIds.length > 0) && (selectedUserIds.length > 0 || selectedCompanyIds.length > 0);

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects`} className="text-sm text-navy-700 underline">
          {t("back")}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg border-3 border-ink bg-maroon-600 px-4 py-2 text-sm font-bold text-white shadow-[3px_3px_0_0_#1a1a1a]"
          >
            {t("newTransmittal")}
          </button>
        </div>
        {error && <p className="text-maroon-700">{error}</p>}

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 mt-4 rounded-xl border-3 border-ink bg-cream p-4 shadow-[4px_4px_0_0_#1a1a1a]">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                {t("subject")}
                <input value={subject} onChange={(e) => setSubject(e.target.value)} required className="mt-1 w-full rounded-lg border-2 border-ink px-2 py-1" />
              </label>
              <label className="text-sm">
                {t("purpose")}
                <select value={purpose} onChange={(e) => setPurpose(e.target.value as (typeof PURPOSES)[number])} className="mt-1 w-full rounded-lg border-2 border-ink px-2 py-1">
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {t(`purpose_${p}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">
              {t("message")}
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border-2 border-ink px-2 py-1" />
            </label>

            <p className="mb-1 mt-4 text-sm font-bold text-navy-900">{t("items")}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {documents.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={selectedDocumentIds.includes(d.id)} onChange={() => toggle(selectedDocumentIds, setSelectedDocumentIds, d.id)} />
                  {t("documentLabel")}: {d.title}
                </label>
              ))}
              {drawings
                .filter((d) => d.currentRevisionId)
                .map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={selectedDrawingIds.includes(d.id)} onChange={() => toggle(selectedDrawingIds, setSelectedDrawingIds, d.id)} />
                    {d.sheetNumber} — {d.title}
                  </label>
                ))}
            </div>

            <p className="mb-1 mt-4 text-sm font-bold text-navy-900">{t("recipients")}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {members.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={selectedUserIds.includes(m.userId)} onChange={() => toggle(selectedUserIds, setSelectedUserIds, m.userId)} />
                  {m.name} ({m.companyName})
                </label>
              ))}
              {companies.map((c) => (
                <label key={c.companyId} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={selectedCompanyIds.includes(c.companyId)} onChange={() => toggle(selectedCompanyIds, setSelectedCompanyIds, c.companyId)} />
                  {t("wholeCompany")}: {c.name}
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="mt-4 rounded-lg border-3 border-ink bg-navy-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? tc("saving") : t("createTransmittal")}
            </button>
          </form>
        )}

        {!transmittals && !error && <p>{tc("loading")}</p>}
        {transmittals && transmittals.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        {transmittals && transmittals.length > 0 && (
          <ul className="flex flex-col gap-3">
            {transmittals.map((tr) => (
              <li key={tr.id} className="rounded-xl border-3 border-ink bg-white p-4 shadow-brutal">
                <Link href={`/${locale}/projects/${params.id}/transmittals/${tr.id}`} className="font-bold text-navy-900 underline">
                  {tr.transmittalNumber} — {tr.subject}
                </Link>
                <div className="mt-1 text-xs text-navy-600">
                  {t(`purpose_${tr.purpose}`)} · {tr.status === "sent" ? t("statusSent") : t("statusDraft")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
