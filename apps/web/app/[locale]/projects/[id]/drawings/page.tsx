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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("sheetNumber")}
              <input
                required
                value={sheetNumber}
                onChange={(e) => setSheetNumber(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("discipline")}
              <input
                required
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("drawingTitle")}
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
        {!drawings && !error && <p>{tc("loading")}</p>}
        {drawings && drawings.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {drawings?.map((drawing) => (
            <li key={drawing.id}>
              <Link
                href={`/${locale}/projects/${params.id}/drawings/${drawing.id}`}
                className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {drawing.sheetNumber} — {drawing.title}
                  </span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                    {drawing.discipline}
                  </span>
                </div>
                {!drawing.currentRevisionId && <p className="mt-1 text-xs text-orange-800">{t("noRevisions")}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
