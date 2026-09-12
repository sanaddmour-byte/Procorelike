"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { RFI_STATUS_TRANSITIONS, type RfiStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface RfiResponse {
  id: string;
  responseText: string;
  isOfficial: boolean;
  respondedBy: string;
  createdAt: string;
}

interface RfiDetail {
  id: string;
  projectId: string;
  number: string;
  subject: string;
  question: string;
  status: RfiStatus;
  ballInCourtUserId: string | null;
  dueDate: string | null;
  costImpactFlag: boolean;
  scheduleImpactFlag: boolean;
  isOverdue: boolean;
  responses: RfiResponse[];
}

interface Member {
  userId: string;
  name: string;
}

function statusLabel(status: RfiStatus, t: (key: string) => string): string {
  return { draft: t("statusDraft"), open: t("statusOpen"), answered: t("statusAnswered"), closed: t("statusClosed") }[status];
}

function transitionLabel(from: RfiStatus, to: RfiStatus, t: (key: string) => string): string {
  if (to === "closed") return t("close");
  if (to === "open" && from === "answered") return t("reopen");
  if (to === "open") return t("submit");
  return statusLabel(to, t);
}

export default function RfiDetailScreen() {
  const t = useTranslations("Rfis");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; rfiId: string }>();

  const [rfi, setRfi] = useState<RfiDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [isOfficial, setIsOfficial] = useState(false);
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await apiJson<RfiDetail>(`/rfis/${params.rfiId}`);
      setRfi(detail);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.rfiId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
  }, [router, locale, load, params.id]);

  function memberName(userId: string | null): string {
    if (!userId) return t("unassigned");
    return members.find((m) => m.userId === userId)?.name ?? userId;
  }

  async function handleAddResponse(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmittingResponse(true);
    try {
      await apiJson(`/rfis/${params.rfiId}/responses`, {
        method: "POST",
        body: JSON.stringify({ responseText, isOfficial }),
      });
      setResponseText("");
      setIsOfficial(false);
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSubmittingResponse(false);
    }
  }

  async function handleTransition(toStatus: RfiStatus): Promise<void> {
    setTransitioning(true);
    try {
      await apiJson(`/rfis/${params.rfiId}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setTransitioning(false);
    }
  }

  if (!rfi) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/rfis`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>

        <div className="mb-1 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
            {rfi.number} — {rfi.subject}
          </h1>
          {rfi.isOverdue && <span className="rounded bg-maroon-100 px-2 py-0.5 text-xs text-maroon-800">{t("overdue")}</span>}
        </div>
        <p className="mb-4 text-sm text-navy-600">
          {statusLabel(rfi.status, t)} · {t("ballInCourt")}: {memberName(rfi.ballInCourtUserId)}
          {rfi.dueDate && ` · ${t("dueDate")}: ${rfi.dueDate.slice(0, 10)}`}
        </p>
        {error && <p className="text-maroon-700">{error}</p>}

        <div className="mb-6 rounded-xl border-3 border-ink bg-white shadow-brutal-sm p-4">
          <p className="whitespace-pre-wrap">{rfi.question}</p>
          <div className="mt-3 flex gap-3 text-xs text-navy-600">
            {rfi.costImpactFlag && <span className="rounded bg-orange-200 px-2 py-0.5 text-orange-900">{t("costImpact")}</span>}
            {rfi.scheduleImpactFlag && <span className="rounded bg-orange-200 px-2 py-0.5 text-orange-900">{t("scheduleImpact")}</span>}
          </div>
        </div>

        {RFI_STATUS_TRANSITIONS[rfi.status].length > 0 && (
          <div className="mb-6 flex gap-2">
            {RFI_STATUS_TRANSITIONS[rfi.status].map((next) => (
              <button
                key={next}
                onClick={() => void handleTransition(next)}
                disabled={transitioning}
                className="rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {transitionLabel(rfi.status, next, t)}
              </button>
            ))}
          </div>
        )}

        <h2 className="mb-2 text-lg font-medium">{t("responses")}</h2>
        {rfi.responses.length === 0 && <p className="mb-4 text-navy-600">{t("noResponses")}</p>}
        <ul className="mb-4 flex flex-col gap-2">
          {rfi.responses.map((r) => (
            <li key={r.id} className="rounded-xl border-3 border-ink bg-white shadow-brutal-sm p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-navy-600">{memberName(r.respondedBy)}</span>
                {r.isOfficial && <span className="rounded-full bg-navy-700 px-2 py-0.5 text-xs text-white">{t("official")}</span>}
              </div>
              <p className="whitespace-pre-wrap text-sm">{r.responseText}</p>
            </li>
          ))}
        </ul>

        {rfi.status !== "closed" && (
          <form onSubmit={(e) => void handleAddResponse(e)} className="flex flex-col gap-3 rounded-xl border-3 border-ink bg-white shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("responseText")}
              <textarea
                required
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                className="rounded-lg border-3 border-ink px-3 py-2"
                rows={3}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
              {t("markOfficial")}
            </label>
            <button
              type="submit"
              disabled={submittingResponse}
              className="self-start rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {t("addResponse")}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
