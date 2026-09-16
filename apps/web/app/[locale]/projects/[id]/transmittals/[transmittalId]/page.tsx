"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface TransmittalItem {
  id: string;
  itemType: string;
  description: string;
}

interface TransmittalRecipient {
  id: string;
  userId: string | null;
  companyId: string | null;
  acknowledgedAt: string | null;
}

interface TransmittalDetail {
  id: string;
  transmittalNumber: string;
  subject: string;
  purpose: string;
  message: string | null;
  status: "draft" | "sent";
  sentAt: string | null;
  items: TransmittalItem[];
  recipients: TransmittalRecipient[];
}

export default function TransmittalDetailPage() {
  const t = useTranslations("Transmittals");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; transmittalId: string }>();

  const [transmittal, setTransmittal] = useState<TransmittalDetail | null>(null);
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [nameByCompanyId, setNameByCompanyId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  function reload(): void {
    apiJson<TransmittalDetail>(`/transmittals/${params.transmittalId}`)
      .then(setTransmittal)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    const stored = loadStoredAuth();
    if (!stored) {
      router.replace(`/${locale}/login`);
      return;
    }
    setCurrentUserId(stored.user.id);
    reload();
    apiJson<{ userId: string; name: string }[]>(`/projects/${params.id}/members`)
      .then((rows) => setNameByUserId(Object.fromEntries(rows.map((r) => [r.userId, r.name]))))
      .catch(() => undefined);
    apiJson<{ companyId: string; name: string }[]>(`/projects/${params.id}/directory-companies`)
      .then((rows) => setNameByCompanyId(Object.fromEntries(rows.map((r) => [r.companyId, r.name]))))
      .catch(() => undefined);
  }, [router, locale, params.transmittalId, params.id]);

  async function handleSend(): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/transmittals/${params.transmittalId}/send`, { method: "POST" });
      reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAcknowledge(): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/transmittals/${params.transmittalId}/acknowledge`, { method: "POST" });
      reload();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  const myRecipientRow = transmittal?.recipients.find((r) => r.userId === currentUserId);

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/transmittals`} className="text-sm text-navy-700 underline">
          {t("back")}
        </Link>
        {error && <p className="text-maroon-700">{error}</p>}
        {!transmittal && !error && <p>{tc("loading")}</p>}
        {transmittal && (
          <>
            <h1 className="mb-1 mt-2 text-2xl font-extrabold tracking-tight text-navy-900">
              {transmittal.transmittalNumber} — {transmittal.subject}
            </h1>
            <p className="mb-4 text-sm text-navy-600">
              {t(`purpose_${transmittal.purpose}`)} · {transmittal.status === "sent" ? t("statusSent") : t("statusDraft")}
            </p>
            {transmittal.message && <p className="mb-4 whitespace-pre-wrap rounded-lg border-2 border-orange-200 bg-white p-3 text-sm">{transmittal.message}</p>}

            <div className="mb-4 flex gap-3">
              {transmittal.status === "draft" && (
                <button type="button" onClick={() => void handleSend()} disabled={busy} className="rounded-lg border-3 border-ink bg-navy-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {t("send")}
                </button>
              )}
              {transmittal.status === "sent" && myRecipientRow && !myRecipientRow.acknowledgedAt && (
                <button type="button" onClick={() => void handleAcknowledge()} disabled={busy} className="rounded-lg border-3 border-ink bg-maroon-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {t("acknowledge")}
                </button>
              )}
              {myRecipientRow?.acknowledgedAt && <span className="self-center text-sm font-semibold text-navy-700">{t("acknowledged")}</span>}
            </div>

            <h2 className="mb-2 font-bold text-navy-900">{t("items")}</h2>
            <ul className="mb-4 flex flex-col gap-1">
              {transmittal.items.map((item) => (
                <li key={item.id} className="rounded-lg border-2 border-orange-200 bg-white px-3 py-2 text-sm">
                  {item.description}
                </li>
              ))}
            </ul>

            <h2 className="mb-2 font-bold text-navy-900">{t("recipients")}</h2>
            <ul className="flex flex-col gap-1">
              {transmittal.recipients.map((r) => (
                <li key={r.id} className="rounded-lg border-2 border-orange-200 bg-white px-3 py-2 text-sm">
                  {r.userId ? (nameByUserId[r.userId] ?? r.userId) : `${t("wholeCompany")}: ${r.companyId ? (nameByCompanyId[r.companyId] ?? r.companyId) : ""}`} —{" "}
                  {r.acknowledgedAt ? t("acknowledged") : t("notAcknowledged")}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
