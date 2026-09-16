"use client";

import { ApiClientError, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import type { PrimeContractStatus } from "@siteops/shared";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface ProjectCompany {
  companyId: string;
  name: string;
}

interface PrimeContract {
  id: string;
  contractNumber: string;
  title: string;
  ownerCompanyId: string;
  originalContractSum: string;
  retentionPct: string;
  executedDate: string | null;
  status: PrimeContractStatus;
  currency: string;
  approvedChangesAmount: string;
  pendingChangesAmount: string;
  revisedContractSum: string;
}

const NEXT_STATUS: Record<PrimeContractStatus, PrimeContractStatus[]> = {
  draft: ["executed"],
  executed: ["closed"],
  closed: [],
};

function money(value: string): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PrimeContractPage() {
  const t = useTranslations("PrimeContract");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [contract, setContract] = useState<PrimeContract | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [contractNumber, setContractNumber] = useState("");
  const [title, setTitle] = useState("");
  const [ownerCompanyId, setOwnerCompanyId] = useState("");
  const [originalContractSum, setOriginalContractSum] = useState("");
  const [retentionPct, setRetentionPct] = useState("0");

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSum, setEditSum] = useState("");

  function load(): void {
    apiJson<PrimeContract>(`/prime-contracts?projectId=${params.id}`)
      .then((row) => {
        setContract(row);
        setNotFound(false);
      })
      .catch((err) => {
        if (err instanceof ApiClientError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(tc("errorGeneric"));
        }
      });
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`)
      .then((rows) => {
        setCompanies(rows);
        setOwnerCompanyId((current) => current || rows[0]?.companyId || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!ownerCompanyId) return;
    setSaving(true);
    try {
      await apiJson("/prime-contracts", {
        method: "POST",
        body: JSON.stringify({
          projectId: params.id,
          contractNumber,
          title,
          ownerCompanyId,
          originalContractSum: Number(originalContractSum || 0),
          retentionPct: Number(retentionPct || 0),
        }),
      });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(): void {
    if (!contract) return;
    setEditTitle(contract.title);
    setEditSum(contract.originalContractSum);
    setEditing(true);
  }

  async function handleSaveEdit(): Promise<void> {
    if (!contract) return;
    setSaving(true);
    try {
      await apiJson(`/prime-contracts/${contract.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editTitle, originalContractSum: Number(editSum || 0) }),
      });
      setEditing(false);
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(toStatus: PrimeContractStatus): Promise<void> {
    if (!contract) return;
    setSaving(true);
    try {
      await apiJson(`/prime-contracts/${contract.id}/transition`, { method: "POST", body: JSON.stringify({ toStatus }) });
      load();
    } catch {
      setError(tc("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  function statusLabel(status: PrimeContractStatus): string {
    return { draft: t("statusDraft"), executed: t("statusExecuted"), closed: t("statusClosed") }[status];
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        {error && <p className="text-maroon-700">{error}</p>}

        {!contract && !notFound && !error && <p>{tc("loading")}</p>}

        {notFound && !contract && (
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-3 rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <p className="text-sm text-navy-600">{t("empty")}</p>
            <label className="flex flex-col gap-1 text-sm">
              {t("contractNumber")}
              <input required value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("contractTitle")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("ownerCompany")}
              <select required value={ownerCompanyId} onChange={(e) => setOwnerCompanyId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("originalContractSum")}
              <input type="number" step="0.01" value={originalContractSum} onChange={(e) => setOriginalContractSum(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("retentionPct")}
              <input type="number" step="0.01" min="0" max="100" value={retentionPct} onChange={(e) => setRetentionPct(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={saving} className="self-start rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {contract && (
          <div className="rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal-sm p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="font-bold text-navy-900">{contract.contractNumber}</span>
                <span className="ml-2 whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">{statusLabel(contract.status)}</span>
              </div>
              {!editing && (
                <button onClick={startEdit} className="rounded-lg border-3 border-ink px-2 py-1 text-xs text-navy-800">
                  {t("edit")}
                </button>
              )}
            </div>

            {editing ? (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  {t("contractTitle")}
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("originalContractSum")}
                  <input type="number" step="0.01" value={editSum} onChange={(e) => setEditSum(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void handleSaveEdit()} disabled={saving} className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 brutal-interactive px-3 py-1.5 text-sm text-white disabled:opacity-50">
                    {t("save")}
                  </button>
                  <button onClick={() => setEditing(false)} className="rounded-lg border-3 border-ink px-3 py-1.5 text-sm text-navy-800">
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-3 font-medium text-navy-800">{contract.title}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-navy-600">{t("ownerCompany")}</div>
                    <div className="font-medium">{companyName(contract.ownerCompanyId)}</div>
                  </div>
                  <div>
                    <div className="text-navy-600">{t("originalContractSum")}</div>
                    <div className="font-medium">{money(contract.originalContractSum)}</div>
                  </div>
                  <div>
                    <div className="text-navy-600">{t("approvedChanges")}</div>
                    <div className="font-medium">{money(contract.approvedChangesAmount)}</div>
                  </div>
                  <div>
                    <div className="text-navy-600">{t("pendingChanges")}</div>
                    <div className="font-medium">{money(contract.pendingChangesAmount)}</div>
                  </div>
                  <div>
                    <div className="text-navy-600">{t("revisedContractSum")}</div>
                    <div className="font-bold">{money(contract.revisedContractSum)}</div>
                  </div>
                  <div>
                    <div className="text-navy-600">{t("retentionPct")}</div>
                    <div className="font-medium">{contract.retentionPct}%</div>
                  </div>
                </div>
                {NEXT_STATUS[contract.status].length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {NEXT_STATUS[contract.status].map((next) => (
                      <button
                        key={next}
                        onClick={() => void handleTransition(next)}
                        disabled={saving}
                        className="rounded-lg border-3 border-ink bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {statusLabel(next)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
