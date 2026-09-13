"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function NewDailyLogPage() {
  const t = useTranslations("DailyLog");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const log = await apiJson<{ id: string }>("/daily-logs", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, logDate, notes: notes || undefined }),
      });
      router.replace(`/${locale}/projects/${params.id}/daily-log/${log.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.code : "unknown_error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-navy-900">{t("createTitle")}</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("date")}
            <input
              type="date"
              required
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="rounded-lg border-3 border-ink px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("notes")}
            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border-3 border-ink px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-maroon-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-white disabled:opacity-50">
              {t("save")}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border-3 border-ink px-3 py-2 text-navy-800"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
