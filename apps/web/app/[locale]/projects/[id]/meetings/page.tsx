"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Meeting {
  id: string;
  title: string;
  occurredAt: string;
}

export default function MeetingsPage() {
  const t = useTranslations("Meetings");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<Meeting[]>(`/meetings?projectId=${params.id}`)
      .then((rows) => setMeetings(rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))))
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
    if (!title.trim() || !occurredAt) return;
    setCreating(true);
    try {
      await apiJson("/meetings", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, title: title.trim(), occurredAt: new Date(occurredAt).toISOString() }),
      });
      setTitle("");
      setOccurredAt("");
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
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white">
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("titleField")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("occurredAt")}
              <input required type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!meetings && !error && <p>{tc("loading")}</p>}
        {meetings && meetings.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <ul className="flex flex-col gap-3">
          {meetings?.map((m) => (
            <li key={m.id}>
              <Link href={`/${locale}/projects/${params.id}/meetings/${m.id}`} className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive">
                <div className="font-bold text-navy-900">{m.title}</div>
                <p className="mt-1 text-sm text-navy-600">{new Date(m.occurredAt).toLocaleString()}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
