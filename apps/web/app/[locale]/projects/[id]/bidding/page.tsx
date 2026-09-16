"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { BidPackageStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface CostCode {
  id: string;
  code: string;
  description: string;
}

interface BidPackage {
  id: string;
  number: string;
  title: string;
  costCodeId: string | null;
  status: BidPackageStatus;
  dueDate: string | null;
}

function statusLabel(status: BidPackageStatus, t: (key: string) => string): string {
  return { draft: t("statusDraft"), open: t("statusOpen"), closed: t("statusClosed"), awarded: t("statusAwarded"), canceled: t("statusCanceled") }[status];
}

export default function BiddingPage() {
  const t = useTranslations("Bidding");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [packages, setPackages] = useState<BidPackage[] | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [costCodeId, setCostCodeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<BidPackage[]>(`/bid-packages?projectId=${params.id}`)
      .then(setPackages)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<CostCode[]>(`/projects/${params.id}/cost-codes`).then(setCostCodes).catch(() => undefined);
  }, [router, locale, params.id]);

  function costCodeLabel(id: string | null): string {
    if (!id) return "—";
    const cc = costCodes.find((c) => c.id === id);
    return cc ? `${cc.code} — ${cc.description}` : id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await apiJson("/bid-packages", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, title: title.trim(), costCodeId: costCodeId || undefined, dueDate: dueDate || undefined }),
      });
      setTitle("");
      setCostCodeId("");
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
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white"
          >
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("packageTitle")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("costCode")}
              <select value={costCodeId} onChange={(e) => setCostCodeId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                <option value="">—</option>
                {costCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("dueDate")}
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!packages && !error && <p>{tc("loading")}</p>}
        {packages && packages.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <ul className="flex flex-col gap-3">
          {packages?.map((bp) => (
            <li key={bp.id}>
              <Link
                href={`/${locale}/projects/${params.id}/bidding/${bp.id}`}
                className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {bp.number} — {bp.title}
                  </span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(bp.status, t)}</span>
                </div>
                <p className="mt-1 text-sm text-navy-600">
                  {costCodeLabel(bp.costCodeId)}
                  {bp.dueDate && ` · ${t("dueDate")}: ${bp.dueDate.slice(0, 10)}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
