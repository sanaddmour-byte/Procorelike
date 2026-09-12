"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function NewPunchItemPage() {
  const t = useTranslations("PunchList");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const item = await apiJson<{ id: string }>("/punch-items", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          description,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });
      router.replace(`/${locale}/projects/${params.id}/punch-list/${item.id}`);
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
        <h1 className="mb-4 text-2xl font-semibold">{t("newButton")}</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("description")}
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("priority")}
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
              className="rounded border border-slate-300 px-3 py-2"
            >
              <option value="low">{t("priorityLow")}</option>
              <option value="medium">{t("priorityMedium")}</option>
              <option value="high">{t("priorityHigh")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("dueDate")}
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50">
              {t("create")}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded border border-slate-300 px-3 py-2 text-slate-700"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
