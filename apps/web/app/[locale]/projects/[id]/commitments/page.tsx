"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

interface ProjectCompany {
  companyId: string;
  name: string;
  type: string;
}

interface Commitment {
  id: string;
  number: string;
  title: string;
  companyId: string;
  type: "subcontract" | "po";
  retentionPct: string;
}

export default function CommitmentsPage() {
  const t = useTranslations("Commitments");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [commitments, setCommitments] = useState<Commitment[] | null>(null);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [type, setType] = useState<"subcontract" | "po">("subcontract");
  const [retentionPct, setRetentionPct] = useState("0");
  const [creating, setCreating] = useState(false);

  function load(): void {
    apiJson<Commitment[]>(`/commitments?projectId=${params.id}`)
      .then(setCommitments)
      .catch(() => setError(tc("errorGeneric")));
  }

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    load();
    apiJson<ProjectCompany[]>(`/projects/${params.id}/companies`)
      .then((cos) => {
        setCompanies(cos);
        setCompanyId((current) => current || cos[0]?.companyId || "");
      })
      .catch(() => undefined);
  }, [router, locale, params.id]);

  function companyName(id: string): string {
    return companies.find((c) => c.companyId === id)?.name ?? id;
  }

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!companyId || !title.trim()) return;
    setCreating(true);
    try {
      await apiJson("/commitments", {
        method: "POST",
        body: JSON.stringify({ projectId: params.id, companyId, type, title: title.trim(), retentionPct: Number(retentionPct || 0) }),
      });
      setTitle("");
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
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
          <button onClick={() => setShowForm((s) => !s)} className="rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white">
            {t("newButton")}
          </button>
        </div>

        {showForm && (
          <form onSubmit={(e) => void handleCreate(e)} className="mb-6 flex flex-col gap-3 rounded-xl border-3 border-ink bg-white shadow-brutal-sm p-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("titleField")}
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("company")}
              <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2">
                {companies.map((c) => (
                  <option key={c.companyId} value={c.companyId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("type")}
              <select value={type} onChange={(e) => setType(e.target.value as "subcontract" | "po")} className="rounded-lg border-3 border-ink px-3 py-2">
                <option value="subcontract">{t("typeSubcontract")}</option>
                <option value="po">{t("typePo")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("retentionPct")}
              <input type="number" step="0.01" min="0" max="100" value={retentionPct} onChange={(e) => setRetentionPct(e.target.value)} className="rounded-lg border-3 border-ink px-3 py-2" />
            </label>
            <button type="submit" disabled={creating} className="self-start rounded-lg border-3 border-ink bg-maroon-700 brutal-interactive px-3 py-2 text-sm text-white disabled:opacity-50">
              {t("create")}
            </button>
          </form>
        )}

        {error && <p className="text-maroon-700">{error}</p>}
        {!commitments && !error && <p>{tc("loading")}</p>}
        {commitments && commitments.length === 0 && <p className="text-navy-600">{t("empty")}</p>}

        <ul className="flex flex-col gap-3">
          {commitments?.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${locale}/projects/${params.id}/commitments/${c.id}`}
                className="block rounded-xl border-3 border-ink bg-white p-4 shadow-brutal-sm brutal-interactive"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-navy-900">
                    {c.number} — {c.title}
                  </span>
                  <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                    {c.type === "po" ? t("typePo") : t("typeSubcontract")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-navy-600">{companyName(c.companyId)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
