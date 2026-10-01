"use client";

import { Modal } from "@/components/ui/Modal";
import { apiJson } from "@/lib/api-client";
import { cachedJson } from "@/lib/cached-json";
import { errorMessage } from "@/lib/error-message";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Member {
  userId: string;
  name: string;
  companyId: string | null;
  companyName: string | null;
}

interface Props {
  projectId: string;
  ids: string[];
  /** Called after the batch ran; `failed` is how many items the server rejected. */
  onDone: (result: { failed: number; total: number }) => void;
}

/** "Assign to…" for a selection of snags: one person, one confirmation, all rows updated (plan B9). */
export function BulkAssign({ projectId, ids, onDone }: Props) {
  const t = useTranslations("BulkAssign");
  const te = useTranslations("Errors");
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notify, setNotify] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && members.length === 0) cachedJson<Member[]>(`/projects/${projectId}/members`).then(setMembers).catch((e) => setError(errorMessage(e, te)));
  }, [open, members.length, projectId, te]);

  async function apply(): Promise<void> {
    const m = members.find((x) => x.userId === userId);
    if (!m && !dueDate && notify.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const results = await apiJson<{ ok: boolean }[]>("/punch-items/bulk-update", {
        method: "POST",
        body: JSON.stringify({
          ids,
          ...(m ? { assigneeUserId: m.userId, ...(m.companyId ? { assigneeCompanyId: m.companyId } : {}) } : {}),
          ...(notify.size > 0 ? { addDistributionUserIds: [...notify] } : {}),
          ...(dueDate ? { dueDate: new Date(`${dueDate}T12:00:00`).toISOString() } : {}),
        }),
      });
      setOpen(false);
      setUserId("");
      setDueDate("");
      setNotify(new Set());
      onDone({ failed: results.filter((r) => !r.ok).length, total: results.length });
    } catch (err) {
      setError(errorMessage(err, te));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-hit rounded-lg border-2 border-ink bg-white px-3 text-xs font-semibold text-navy-800 md:min-h-0 md:py-1">
        {t("action")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("title", { count: ids.length })} sheet>
        <div className="flex flex-col gap-3">
          <select aria-label={t("person")} value={userId} onChange={(e) => setUserId(e.target.value)} className="hit-task rounded-lg border-3 border-ink bg-white px-2">
            <option value="">{t("person")}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
                {m.companyName ? ` — ${m.companyName}` : ""}
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1 text-sm">
            {t("dueDate")}
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="hit-task rounded-lg border-3 border-ink bg-white px-2" />
          </label>
          <fieldset className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border-3 border-ink p-2">
            <legend className="px-1 text-sm font-semibold">{t("notify")}</legend>
            {members.map((m) => (
              <label key={m.userId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={notify.has(m.userId)}
                  onChange={() => setNotify((prev) => { const n = new Set(prev); if (n.has(m.userId)) n.delete(m.userId); else n.add(m.userId); return n; })}
                />
                {m.name}
              </label>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-maroon-700">
              {error}
            </p>
          )}
          <button type="button" disabled={(!userId && !dueDate && notify.size === 0) || busy} onClick={() => void apply()} className="hit-task rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 px-3 font-bold text-white disabled:opacity-50">
            {t("apply", { count: ids.length })}
          </button>
        </div>
      </Modal>
    </>
  );
}
