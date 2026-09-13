"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type MeetingItemStatus = "open" | "closed" | "converted";

interface MeetingItem {
  id: string;
  description: string;
  status: MeetingItemStatus;
  convertedToId: string | null;
}

interface MeetingDetail {
  id: string;
  title: string;
  occurredAt: string;
  items: MeetingItem[];
}

interface Meeting {
  id: string;
  title: string;
}

export default function MeetingDetailPage() {
  const t = useTranslations("Meetings");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; meetingId: string }>();

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [otherMeetings, setOtherMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newItemDescription, setNewItemDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [carryForwardTarget, setCarryForwardTarget] = useState<Record<string, string>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  function load(): void {
    apiJson<MeetingDetail>(`/meetings/${params.meetingId}`)
      .then(setMeeting)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<Meeting[]>(`/meetings?projectId=${params.id}`)
      .then((rows) => setOtherMeetings(rows.filter((m) => m.id !== params.meetingId)))
      .catch(() => undefined);
  }, [router, locale, params.id, params.meetingId]);

  async function handleAddItem(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newItemDescription.trim()) return;
    setAdding(true);
    try {
      await apiJson(`/meetings/${params.meetingId}/items`, {
        method: "POST",
        body: JSON.stringify({ description: newItemDescription.trim() }),
      });
      setNewItemDescription("");
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setAdding(false);
    }
  }

  async function handleClose(itemId: string): Promise<void> {
    setBusyItemId(itemId);
    try {
      await apiJson(`/meeting-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ toStatus: "closed" }) });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleCarryForward(itemId: string): Promise<void> {
    const toMeetingId = carryForwardTarget[itemId];
    if (!toMeetingId) return;
    setBusyItemId(itemId);
    try {
      await apiJson(`/meeting-items/${itemId}/carry-forward`, { method: "POST", body: JSON.stringify({ toMeetingId }) });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleConvert(itemId: string): Promise<void> {
    setBusyItemId(itemId);
    try {
      await apiJson(`/meeting-items/${itemId}/convert-to-punch-item`, { method: "POST" });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusyItemId(null);
    }
  }

  function statusLabel(status: MeetingItemStatus): string {
    return { open: t("statusOpen"), closed: t("statusClosed"), converted: t("statusConverted") }[status];
  }

  if (!meeting && !error) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p>{tc("loading")}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/meetings`} className="mb-4 inline-block text-sm text-maroon-700 underline">
          {t("back")}
        </Link>
        {error && <p className="mb-4 rounded-lg border-3 border-maroon-700 bg-gradient-to-b from-maroon-50 to-maroon-100 p-2 text-sm text-maroon-800">{error}</p>}
        {meeting && (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{meeting.title}</h1>
            <p className="mb-4 text-sm text-navy-600">{new Date(meeting.occurredAt).toLocaleString()}</p>

            <h2 className="mb-2 text-lg font-bold text-navy-900">{t("actionItems")}</h2>
            <form onSubmit={(e) => void handleAddItem(e)} className="mb-4 flex gap-2">
              <input
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                placeholder={t("description")}
                className="flex-1 rounded-lg border-3 border-ink px-3 py-2"
              />
              <button type="submit" disabled={adding || !newItemDescription.trim()} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                {t("addItem")}
              </button>
            </form>

            {meeting.items.length === 0 && <p className="text-navy-600">{t("noActionItems")}</p>}
            <ul className="flex flex-col gap-3">
              {meeting.items.map((item) => (
                <li key={item.id} className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium">{item.description}</span>
                    <span
                      className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${
                        item.status === "converted" ? "bg-orange-100 text-navy-800" : item.status === "closed" ? "bg-navy-100 text-navy-800" : "bg-maroon-100 text-maroon-800"
                      }`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  {item.status === "open" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => void handleClose(item.id)} disabled={busyItemId === item.id} className="rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800 disabled:opacity-50">
                        {t("close")}
                      </button>
                      <button onClick={() => void handleConvert(item.id)} disabled={busyItemId === item.id} className="rounded-lg border-3 border-ink bg-gradient-to-b from-orange-400 to-orange-600 brutal-interactive px-2 py-1 text-xs font-bold text-ink disabled:opacity-50">
                        {t("convertToPunchItem")}
                      </button>
                      <select
                        value={carryForwardTarget[item.id] ?? ""}
                        onChange={(e) => setCarryForwardTarget((s) => ({ ...s, [item.id]: e.target.value }))}
                        className="rounded-lg border-3 border-ink px-2 py-1 text-xs"
                      >
                        <option value="">{t("selectMeeting")}</option>
                        {otherMeetings.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => void handleCarryForward(item.id)}
                        disabled={busyItemId === item.id || !carryForwardTarget[item.id]}
                        className="rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800 disabled:opacity-50"
                      >
                        {t("carryForward")}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
