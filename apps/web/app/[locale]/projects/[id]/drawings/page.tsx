"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Drawing {
  id: string;
  sheetNumber: string;
  discipline: string;
  title: string;
  currentRevisionId: string | null;
}

export default function DrawingsPage() {
  const t = useTranslations("Drawings");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [drawings, setDrawings] = useState<Drawing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sheetNumber, setSheetNumber] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<Drawing[]>(`/drawings?projectId=${params.id}`)
      .then(setDrawings)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
  }, [router, locale, params.id]);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/drawings", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, sheetNumber, discipline, title }),
      });
      setSheetNumber("");
      setDiscipline("");
      setTitle("");
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
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <button onClick={() => setShowForm((s) => !s)} className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded border border-slate-200 p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("sheetNumber")}
              <input
                required
                value={sheetNumber}
                onChange={(e) => setSheetNumber(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("discipline")}
              <input
                required
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("drawingTitle")}
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="self-start rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-red-600">{error}</p>}
        {!drawings && !error && <p>{tc("loading")}</p>}
        {drawings && drawings.length === 0 && <p className="text-slate-500">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {drawings?.map((drawing) => (
            <li key={drawing.id}>
              <Link
                href={`/${locale}/projects/${params.id}/drawings/${drawing.id}`}
                className="block rounded border border-slate-200 p-4 hover:border-slate-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {drawing.sheetNumber} — {drawing.title}
                  </span>
                  <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {drawing.discipline}
                  </span>
                </div>
                {!drawing.currentRevisionId && <p className="mt-1 text-xs text-amber-700">{t("noRevisions")}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
