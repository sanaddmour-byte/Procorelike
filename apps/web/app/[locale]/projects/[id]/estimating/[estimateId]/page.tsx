"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { EstimateStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface CostCode {
  id: string;
  code: string;
  description: string;
}

interface EstimateLineItem {
  id: string;
  costCodeId: string;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
  amount: string;
}

interface EstimateDetail {
  id: string;
  number: string;
  title: string;
  status: EstimateStatus;
  convertedToBudgetAt: string | null;
  lineItems: EstimateLineItem[];
  total: string;
}

function money(value: string): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EstimateDetailPage() {
  const t = useTranslations("Estimating");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; estimateId: string }>();

  const [detail, setDetail] = useState<EstimateDetail | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [costCodeId, setCostCodeId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [unitCost, setUnitCost] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiJson<EstimateDetail>(`/estimates/${params.estimateId}`);
      setDetail(data);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.estimateId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    apiJson<CostCode[]>(`/projects/${params.id}/cost-codes`)
      .then((codes) => {
        setCostCodes(codes);
        setCostCodeId((c) => c || codes[0]?.id || "");
      })
      .catch(() => undefined);
  }, [router, locale, load, params.id]);

  function costCodeLabel(id: string): string {
    const cc = costCodes.find((c) => c.id === id);
    return cc ? `${cc.code} — ${cc.description}` : id;
  }

  async function handleAddLineItem(): Promise<void> {
    if (!costCodeId || !description.trim() || !quantity || !unit.trim() || !unitCost) return;
    setBusy(true);
    try {
      await apiJson(`/estimates/${params.estimateId}/line-items`, {
        method: "POST",
        body: JSON.stringify({ costCodeId, description: description.trim(), quantity: Number(quantity), unit: unit.trim(), unitCost: Number(unitCost) }),
      });
      setDescription("");
      setQuantity("");
      setUnit("");
      setUnitCost("");
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize(): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/estimates/${params.estimateId}/finalize`, { method: "POST" });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleConvert(): Promise<void> {
    setBusy(true);
    try {
      await apiJson(`/estimates/${params.estimateId}/convert-to-budget`, { method: "POST" });
      await load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <>
        <Header />
        <ProjectTabs projectId={params.id} />
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  const editable = detail.status === "draft";

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/estimating`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
            {detail.number} — {detail.title}
          </h1>
          <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{detail.status === "draft" ? t("statusDraft") : t("statusFinal")}</span>
        </div>
        {error && <p className="text-maroon-700">{error}</p>}

        {editable && (
          <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <h2 className="mb-2 text-sm font-bold text-navy-900">{t("addLineItem")}</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <select value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2 text-sm">
                {costCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.description}
                  </option>
                ))}
              </select>
              <input placeholder={t("description")} value={description} onChange={(e) => setDescription(e.target.value)} className="flex-1 rounded-lg border-3 border-ink px-3 py-2 text-sm" />
              <input type="number" step="0.01" placeholder={t("quantity")} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-24 rounded-lg border-3 border-ink px-3 py-2 text-sm" />
              <input placeholder={t("unit")} value={unit} onChange={(e) => setUnit(e.target.value)} className="w-20 rounded-lg border-3 border-ink px-3 py-2 text-sm" />
              <input type="number" step="0.01" placeholder={t("unitCost")} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="w-28 rounded-lg border-3 border-ink px-3 py-2 text-sm" />
              <button onClick={() => void handleAddLineItem()} disabled={busy} className="rounded-lg border-3 border-ink bg-navy-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {t("addLineItem")}
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
          {detail.lineItems.length === 0 && <p className="text-sm text-navy-600">{t("emptyLineItems")}</p>}
          <ul className="flex flex-col gap-2">
            {detail.lineItems.map((li) => (
              <li key={li.id} className="flex items-center justify-between gap-2 rounded-lg border-2 border-orange-200 bg-white p-2 text-sm">
                <div>
                  <div className="font-medium">{li.description}</div>
                  <div className="text-xs text-navy-600">
                    {costCodeLabel(li.costCodeId)} · {li.quantity} {li.unit} × {money(li.unitCost)}
                  </div>
                </div>
                <span className="font-bold">{money(li.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t-2 border-orange-200 pt-2 text-sm font-bold">
            <span>{t("total")}</span>
            <span>{money(detail.total)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <button onClick={() => void handleFinalize()} disabled={busy} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("finalize")}
            </button>
          )}
          {!editable && !detail.convertedToBudgetAt && (
            <button onClick={() => void handleConvert()} disabled={busy} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("convertToBudget")}
            </button>
          )}
          {detail.convertedToBudgetAt && <p className="text-sm text-navy-600">{t("convertedToBudget")}</p>}
        </div>
      </main>
    </>
  );
}
