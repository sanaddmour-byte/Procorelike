"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Rfi {
  id: string;
  number: string;
  subject: string;
  status: "draft" | "open" | "answered" | "closed";
  ballInCourtUserId: string | null;
  dueDate: string | null;
  isOverdue: boolean;
}

interface Member {
  userId: string;
  name: string;
}

function statusLabel(status: Rfi["status"], t: (key: string) => string): string {
  return { draft: t("statusDraft"), open: t("statusOpen"), answered: t("statusAnswered"), closed: t("statusClosed") }[status];
}

export default function RfisPage() {
  const t = useTranslations("Rfis");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [rfis, setRfis] = useState<Rfi[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [ballInCourtUserId, setBallInCourtUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<Rfi[]>(`/rfis?projectId=${params.id}`)
      .then(setRfis)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [router, locale, params.id]);

  function memberName(userId: string | null): string {
    if (!userId) return t("unassigned");
    return members.find((m) => m.userId === userId)?.name ?? userId;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setCreating(true);
    try {
      await apiJson("/rfis", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          subject,
          question,
          ballInCourtUserId: ballInCourtUserId || undefined,
          dueDate: dueDate || undefined,
        }),
      });
      setSubject("");
      setQuestion("");
      setBallInCourtUserId("");
      setDueDate("");
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
              {t("subject")}
              <input required value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("question")}
              <textarea
                required
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
                rows={3}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("ballInCourt")}
              <select
                value={ballInCourtUserId}
                onChange={(e) => setBallInCourtUserId(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="">{t("unassigned")}</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("dueDate")}
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
            </label>
            <button type="submit" disabled={creating} className="self-start rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-red-600">{error}</p>}
        {!rfis && !error && <p>{tc("loading")}</p>}
        {rfis && rfis.length === 0 && <p className="text-slate-500">{t("empty")}</p>}
        <ul className="flex flex-col gap-3">
          {rfis?.map((rfi) => (
            <li key={rfi.id}>
              <Link
                href={`/${locale}/projects/${params.id}/rfis/${rfi.id}`}
                className="block rounded border border-slate-200 p-4 hover:border-slate-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {rfi.number} — {rfi.subject}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    {rfi.isOverdue && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">{t("overdue")}</span>}
                    <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {statusLabel(rfi.status, t)}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {t("ballInCourt")}: {memberName(rfi.ballInCourtUserId)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
