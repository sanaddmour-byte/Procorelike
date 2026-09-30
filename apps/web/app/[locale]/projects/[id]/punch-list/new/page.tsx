"use client";

import { PersonnelPicker } from "@/components/PersonnelPicker";
import { CaptureButton } from "@/components/ui/CaptureButton";
import { FormShell } from "@/components/ui/FormShell";
import { LocationPicker } from "@/components/ui/LocationPicker";
import { VoiceField } from "@/components/ui/VoiceField";
import { cachedJson } from "@/lib/cached-json";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useDraft } from "@/lib/drafts";
import { errorMessage } from "@/lib/error-message";
import { enqueueSnag, isOfflineError } from "@/lib/outbox";
import { createSnag, type NewSnag } from "@/lib/snag";
import { loadCreateDefaults, saveCreateDefaults } from "@/lib/session-defaults";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Member {
  userId: string;
  name: string;
  companyId: string;
}
interface Trade {
  id: string;
  name: string;
}
type Priority = "low" | "medium" | "high";

interface FormState {
  description: string;
  priority: Priority;
  dueDate: string;
  locationId?: string;
  tradeId?: string;
  assigneeUserId?: string;
  finalApproverUserId?: string;
  distributionUserIds: string[];
  photos: File[];
}

const EMPTY: FormState = { description: "", priority: "medium", dueDate: "", distributionUserIds: [], photos: [] };

export default function NewPunchItemPage() {
  const t = useTranslations("PunchList");
  const tf = useTranslations("Field");
  const te = useTranslations("Errors");
  const ts = useTranslations("Sync");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const [me, setMe] = useState<string | undefined>(undefined);
  useEffect(() => setMe(loadStoredAuth()?.user.id), []);

  const { value: f, setValue, replace, clear, ready, restored } = useDraft<FormState>(`punch-new:${params.id}`, EMPTY);
  const [members, setMembers] = useState<Member[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    cachedJson<Member[]>(`/projects/${params.id}/members`).then(setMembers).catch(() => undefined);
    cachedJson<Trade[]>(`/projects/${params.id}/trades`).then(setTrades).catch(() => undefined);
  }, [params.id]);

  // "Same as last": prefill location / trade / assignee from the previous snag on this device (plan D7) unless a draft was restored.
  useEffect(() => {
    if (!ready || restored) return;
    const d = loadCreateDefaults(params.id);
    setValue({ locationId: d.locationId, tradeId: d.tradeId, assigneeUserId: d.assigneeUserId });
  }, [ready, restored, params.id]);

  const canSubmit = f.description.trim().length > 0 || f.photos.length > 0;

  async function save(): Promise<{ id: string | null; number: string | null } | null> {
    if (!canSubmit) {
      setError(tf("required"));
      return null;
    }
    setError(null);
    setSubmitting(true);
    try {
      const assignee = members.find((m) => m.userId === f.assigneeUserId);
      const snag: NewSnag = {
        projectId: params.id,
        description: f.description.trim() || tf("photoOnlyDescription"),
        priority: f.priority,
        dueDate: f.dueDate ? new Date(f.dueDate).toISOString() : undefined,
        locationId: f.locationId,
        tradeId: f.tradeId,
        assigneeUserId: f.assigneeUserId,
        assigneeCompanyId: assignee?.companyId,
        finalApproverUserId: f.finalApproverUserId,
        distributionUserIds: f.distributionUserIds,
      };
      let created: { id: string | null; number: string | null };
      try {
        created = await createSnag(snag, f.photos);
      } catch (err) {
        if (!isOfflineError(err)) throw err;
        // No connection: keep the snag (and its photos) on the device and send it later -- never lose it, never make the user wait (plan D2).
        await enqueueSnag(snag, f.photos);
        created = { id: null, number: null };
      }
      saveCreateDefaults(params.id, { locationId: f.locationId, tradeId: f.tradeId, assigneeUserId: f.assigneeUserId, assigneeCompanyId: assignee?.companyId });
      if ("vibrate" in navigator) navigator.vibrate?.(30);
      clear();
      return created;
    } catch (err) {
      setError(errorMessage(err, te));
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate(): Promise<void> {
    const created = await save();
    if (!created) return;
    router.replace(created.id ? `/${locale}/projects/${params.id}/punch-list/${created.id}` : `/${locale}/projects/${params.id}/my-work`);
  }

  async function handleAddAnother(): Promise<void> {
    const created = await save();
    if (!created) return;
    replace({ ...EMPTY, locationId: f.locationId, tradeId: f.tradeId, assigneeUserId: f.assigneeUserId });
    setNotice(created.number ? tf("savedNumber", { number: created.number }) : ts("queued"));
  }

  const chip = (active: boolean): string =>
    `hit-task flex-1 rounded-lg border-3 border-ink px-2 font-bold ${active ? "bg-navy-900 text-white" : "bg-white text-navy-900"}`;

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-3 text-2xl font-extrabold tracking-tight text-navy-900">{t("newButton")}</h1>
      {notice && (
        <p role="status" className="mb-3 rounded-lg border-3 border-ink bg-green-50 px-3 py-2 text-sm font-semibold text-navy-900">
          {notice}
        </p>
      )}
      <FormShell
        onSubmit={handleCreate}
        submitLabel={t("create")}
        submitting={submitting}
        onSaveAndAddAnother={handleAddAnother}
        onCancel={() => router.back()}
        error={error}
        restoredNotice={restored}
      >
        <CaptureButton photos={f.photos} onChange={(photos) => setValue({ photos })} primary />

        <label className="flex flex-col gap-1 text-sm">
          {t("description")}
          <VoiceField
            rows={3}
            value={f.description}
            onValueChange={(description) => {
              setNotice(null);
              setValue({ description });
            }}
            className="w-full rounded-lg border-3 border-ink px-3 py-2 text-base"
          />
        </label>

        <LocationPicker projectId={params.id} value={f.locationId} onChange={(locationId) => setValue({ locationId })} />

        <div className="flex flex-col gap-1 text-sm">
          <span>{tf("assignee")}</span>
          <div className="flex gap-gap-hit">
            {me && (
              <button type="button" aria-pressed={f.assigneeUserId === me} onClick={() => setValue({ assigneeUserId: f.assigneeUserId === me ? undefined : me })} className={`${chip(f.assigneeUserId === me)} flex-none px-5`}>
                {tf("assignMe")}
              </button>
            )}
            <select
              aria-label={tf("assignee")}
              value={f.assigneeUserId ?? ""}
              onChange={(e) => setValue({ assigneeUserId: e.target.value || undefined })}
              className="hit-task min-w-0 flex-1 rounded-lg border-3 border-ink px-3 text-base"
            >
              <option value="">{tf("unassigned")}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span>{t("priority")}</span>
          <div className="flex gap-gap-hit" role="group" aria-label={t("priority")}>
            {(["low", "medium", "high"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={f.priority === p} onClick={() => setValue({ priority: p })} className={chip(f.priority === p)}>
                {t(p === "low" ? "priorityLow" : p === "medium" ? "priorityMedium" : "priorityHigh")}
              </button>
            ))}
          </div>
        </div>

        <details className="rounded-lg border-3 border-ink bg-white/60 px-3 py-1">
          <summary className="hit-task flex cursor-pointer items-center font-semibold text-navy-900">{tf("moreOptions")}</summary>
          <div className="flex flex-col gap-3 pb-3">
            <label className="flex flex-col gap-1 text-sm">
              {tf("trade")}
              <select value={f.tradeId ?? ""} onChange={(e) => setValue({ tradeId: e.target.value || undefined })} className="hit-task rounded-lg border-3 border-ink px-3 text-base">
                <option value="">{tf("noTrade")}</option>
                {trades.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("dueDate")}
              <input type="date" value={f.dueDate} onChange={(e) => setValue({ dueDate: e.target.value })} className="rounded-lg border-3 border-ink px-3 text-base" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("finalApprover")}
              <select value={f.finalApproverUserId ?? ""} onChange={(e) => setValue({ finalApproverUserId: e.target.value || undefined })} className="hit-task rounded-lg border-3 border-ink px-3 text-base">
                <option value="">{t("unassigned")}</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <PersonnelPicker label={t("distribution")} members={members} selectedUserIds={f.distributionUserIds} onChange={(distributionUserIds) => setValue({ distributionUserIds })} />
          </div>
        </details>
      </FormShell>
    </main>
  );
}
