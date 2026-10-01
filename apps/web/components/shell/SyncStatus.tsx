"use client";

import { discardOutbox, retryOutbox, useOutbox } from "@/lib/outbox";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Always-visible truth about what is (not) saved on the server: offline banner, queued count, failed entries with retry / discard (plan D2, D3). */
export function SyncStatus() {
  const t = useTranslations("Sync");
  const { entries, pending, failed, syncing } = useOutbox();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online && pending === 0 && failed === 0) return null;
  return (
    <div role="status" aria-live="polite" className="mb-2 flex flex-col gap-1 rounded-lg border-3 border-ink bg-orange-100 px-3 py-2 text-sm font-semibold text-navy-900">
      {!online && <span>{t("offline")}</span>}
      {pending > 0 && <span>{syncing ? t("syncing", { count: pending }) : t("waiting", { count: pending })}</span>}
      {entries
        .filter((e) => e.status === "failed")
        .map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{t("failedItem", { title: e.snag.description })}</span>
            <button type="button" onClick={() => void retryOutbox(e.id)} className="min-h-hit rounded-lg border-3 border-ink bg-white px-3">
              {t("retry")}
            </button>
            <button type="button" onClick={() => void discardOutbox(e.id)} className="min-h-hit rounded-lg border-3 border-ink bg-white px-3">
              {t("discard")}
            </button>
          </div>
        ))}
    </div>
  );
}
