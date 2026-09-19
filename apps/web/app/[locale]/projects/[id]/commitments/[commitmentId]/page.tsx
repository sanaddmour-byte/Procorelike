"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { formatMoney } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface CostCode {
  id: string;
  code: string;
  description: string;
}

interface CommitmentLineItem {
  id: string;
  costCodeId: string;
  description: string;
  scheduleOfValuesAmount: string;
}

interface CommitmentDetail {
  id: string;
  number: string;
  title: string;
  type: "subcontract" | "po";
  retentionPct: string;
  currency: string;
  lineItems: CommitmentLineItem[];
  contractValue: number;
}

export default function CommitmentDetailPage() {
  const t = useTranslations("Commitments");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; commitmentId: string }>();
  const money = (value: number | string, currency: string): string => formatMoney(value, currency, locale);

  const [commitment, setCommitment] = useState<CommitmentDetail | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [costCodeId, setCostCodeId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  function load(): void {
    apiJson<CommitmentDetail>(`/commitments/${params.commitmentId}`)
      .then(setCommitment)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<CostCode[]>(`/projects/${params.id}/cost-codes`)
      .then((codes) => {
        setCostCodes(codes);
        setCostCodeId((current) => current || codes[0]?.id || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id, params.commitmentId]);

  function costCodeLabel(id: string): string {
    const cc = costCodes.find((c) => c.id === id);
    return cc ? `${cc.code} — ${cc.description}` : id;
  }

  async function handleAddLineItem(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!costCodeId || !description.trim()) return;
    setSaving(true);
    try {
      await apiJson(`/commitments/${params.commitmentId}/line-items`, {
        method: "POST",
        body: JSON.stringify({ costCodeId, description: description.trim(), scheduleOfValuesAmount: Number(amount || 0) }),
      });
      setDescription("");
      setAmount("");
      setShowForm(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  if (!commitment && !error) {
    return (
      <>
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p>{tc("loading")}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/commitments`} className="mb-4 inline-block text-sm text-maroon-700 underline">
          {t("back")}
        </Link>
        {error && <p className="text-maroon-700">{error}</p>}
        {commitment && (
          <>
            <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-navy-900">
              {commitment.number} — {commitment.title}
            </h1>
            <p className="mb-4 text-sm text-navy-600">
              {t("retentionPct")}: {commitment.retentionPct}%
            </p>

            <div className="mb-6 rounded-xl border-3 border-ink bg-orange-50 shadow-brutal-sm p-4">
              <div className="text-sm text-navy-700">{t("contractValue")}</div>
              <div className="text-2xl font-extrabold text-navy-900">
                {money(commitment.contractValue, commitment.currency)}
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy-900">{t("lineItems")}</h2>
              <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-sm text-white">
                {t("addLineItem")}
              </button>
            </div>

            {showForm && (
              <form onSubmit={(e) => void handleAddLineItem(e)} className="mb-4 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
                <label className="flex flex-col gap-1 text-sm">
                  {t("costCode")}
                  <select required value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                    {costCodes.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.code} — {cc.description}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("description")}
                  <input required value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("amount")}
                  <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                </label>
                <button type="submit" disabled={saving} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
                  {t("create")}
                </button>
              </form>
            )}

            {commitment.lineItems.length === 0 && <p className="text-navy-600">{t("noLineItems")}</p>}
            <ul className="flex flex-col gap-2">
              {commitment.lineItems.map((li) => (
                <li key={li.id} className="flex items-center justify-between rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-3">
                  <div>
                    <div className="font-medium">{li.description}</div>
                    <div className="text-xs text-navy-600">{costCodeLabel(li.costCodeId)}</div>
                  </div>
                  <div className="font-bold text-navy-900">{money(Number(li.scheduleOfValuesAmount), commitment.currency)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
