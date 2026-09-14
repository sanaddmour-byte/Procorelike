"use client";

import { Header } from "@/components/Header";
import { PersonnelPicker } from "@/components/PersonnelPicker";
import { ProjectTabs } from "@/components/ProjectTabs";
import { ApiClientError, apiJson } from "@/lib/api-client";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface Member {
  userId: string;
  name: string;
}

export default function NewPunchItemPage() {
  const t = useTranslations("PunchList");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [finalApproverUserId, setFinalApproverUserId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [distributionUserIds, setDistributionUserIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [params.id]);

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
          finalApproverUserId: finalApproverUserId || undefined,
          distributionUserIds,
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
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-navy-900">{t("newButton")}</h1>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("description")}
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border-3 border-ink px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("priority")}
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
              className="rounded-lg border-3 border-ink px-3 py-2"
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
              className="rounded-lg border-3 border-ink px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("finalApprover")}
            <select
              value={finalApproverUserId}
              onChange={(e) => setFinalApproverUserId(e.target.value)}
              className="rounded-lg border-3 border-ink px-3 py-2"
            >
              <option value="">{t("unassigned")}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <PersonnelPicker label={t("distribution")} members={members} selectedUserIds={distributionUserIds} onChange={setDistributionUserIds} />
          {error && <p className="text-sm text-maroon-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={submitting} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-white disabled:opacity-50">
              {t("create")}
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
