"use client";

import { DrawingViewer, type MarkupPin } from "@/components/DrawingViewer";
import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { uploadAttachment } from "@/lib/upload";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface Drawing {
  id: string;
  projectId: string;
  sheetNumber: string;
  discipline: string;
  title: string;
  currentRevisionId: string | null;
}

interface Revision {
  id: string;
  revisionCode: string;
  attachmentId: string;
  issuedDate: string;
  supersededAt: string | null;
}

export default function DrawingDetailScreen() {
  const t = useTranslations("Drawings");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; drawingId: string }>();

  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [markups, setMarkups] = useState<MarkupPin[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [revisionCode, setRevisionCode] = useState("");
  const [issuedDate, setIssuedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const currentRevision = revisions?.find((r) => r.id === drawing?.currentRevisionId) ?? null;

  const loadAll = useCallback(async () => {
    try {
      const [drawingRes, revisionsRes] = await Promise.all([
        apiJson<Drawing>(`/drawings/${params.drawingId}`),
        apiJson<Revision[]>(`/drawings/${params.drawingId}/revisions`),
      ]);
      setDrawing(drawingRes);
      setRevisions(revisionsRes);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.drawingId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void loadAll();
  }, [router, locale, loadAll]);

  useEffect(() => {
    if (!currentRevision) {
      setPdfUrl(null);
      setMarkups([]);
      return;
    }
    apiJson<{ downloadUrl: string }>(`/attachments/${currentRevision.attachmentId}/download`)
      .then((res) => setPdfUrl(res.downloadUrl))
      .catch(() => setError(tc("errorGeneric")));
    apiJson<MarkupPin[]>(`/drawings/revisions/${currentRevision.id}/markups`)
      .then(setMarkups)
      .catch(() => setError(tc("errorGeneric")));
  }, [currentRevision, tc]);

  async function handleUploadRevision(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!file || !drawing) return;
    setUploading(true);
    setError(null);
    try {
      const attachmentId = await uploadAttachment({
        projectId: drawing.projectId,
        ownerType: "drawing_revision",
        ownerId: drawing.id,
        file,
      });
      await apiJson(`/drawings/${drawing.id}/revisions`, {
        method: "POST",
        body: JSON.stringify({ revisionCode, issuedDate, attachmentId }),
      });
      setRevisionCode("");
      setFile(null);
      setShowForm(false);
      await loadAll();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setUploading(false);
    }
  }

  async function handleAddPin(x: number, y: number): Promise<void> {
    if (!currentRevision) return;
    const note = window.prompt(t("noteLabel")) ?? undefined;
    try {
      const created = await apiJson<MarkupPin>(`/drawings/revisions/${currentRevision.id}/markups`, {
        method: "POST",
        body: JSON.stringify({ coords: { type: "pin", x, y }, note }),
      });
      setMarkups((prev) => [...prev, created]);
    } catch {
      setError(tc("errorGeneric"));
    }
  }

  if (!drawing || !revisions) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-3xl px-4 py-8">
          {error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/drawings`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-navy-900">
          {drawing.sheetNumber} — {drawing.title}
        </h1>
        <p className="mb-4 text-sm text-navy-600">{drawing.discipline}</p>
        {error && <p className="text-maroon-700">{error}</p>}

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-medium">{t("viewer")}</h2>
          {currentRevision && pdfUrl ? (
            <>
              <p className="mb-2 text-xs text-navy-600">{t("viewerHint")}</p>
              <DrawingViewer pdfUrl={pdfUrl} markups={markups} errorLabel={t("viewerError")} onAddPin={(x, y) => void handleAddPin(x, y)} />
            </>
          ) : (
            <p className="text-navy-600">{t("noRevisions")}</p>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-medium">{t("revisionHistory")}</h2>
            <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
              {t("uploadRevision")}
            </button>
          </div>

          {showForm && (
            <form onSubmit={(e) => void handleUploadRevision(e)} className="mb-4 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
              <label className="flex flex-col gap-1 text-sm">
                {t("revisionCode")}
                <input
                  required
                  value={revisionCode}
                  onChange={(e) => setRevisionCode(e.target.value)}
                  className="rounded-lg border-3 border-ink px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("issuedDate")}
                <input
                  required
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                  className="rounded-lg border-3 border-ink px-3 py-2"
                />
              </label>
              <input
                required
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
              <button
                type="submit"
                disabled={uploading || !file}
                className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {uploading ? t("uploading") : t("uploadRevision")}
              </button>
            </form>
          )}

          {revisions.length === 0 && <p className="text-navy-600">{t("noRevisions")}</p>}
          <ul className="flex flex-col gap-2">
            {revisions.map((rev) => (
              <li
                key={rev.id}
                className="flex items-center justify-between gap-2 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-3 text-sm"
              >
                <span>
                  {t("revisionCode")} {rev.revisionCode} — {rev.issuedDate.slice(0, 10)}
                </span>
                <span
                  className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                    rev.supersededAt ? "bg-orange-100 text-navy-600" : "bg-navy-900 text-white"
                  }`}
                >
                  {rev.supersededAt ? t("superseded") : t("current")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
