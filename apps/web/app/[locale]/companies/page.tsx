"use client";

import { Header } from "@/components/Header";
import { apiFetch, apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";

interface Company {
  id: string;
  name: string;
  type: string;
  hasLogo: boolean;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // "data:image/png;base64,AAAA..." -> "AAAA..."
      const commaIndex = result.indexOf(",");
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

function CompanyLogoCard({ company, onUploaded }: { company: Company; onUploaded: () => void }) {
  const t = useTranslations("Companies");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company.hasLogo) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    apiFetch(`/companies/${company.id}/logo`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPreviewUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [company.id, company.hasLogo]);

  function handleFile(e: ChangeEvent<HTMLInputElement>): void {
    const selected = e.target.files?.[0];
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.type !== "image/png") {
      setError(t("pngOnly"));
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handleUpload(): Promise<void> {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataBase64 = await readFileAsBase64(file);
      await apiJson(`/companies/${company.id}/logo`, {
        method: "POST",
        body: JSON.stringify({ mime: "image/png", dataBase64 }),
      });
      setFile(null);
      onUploaded();
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream shadow-brutal">
      <div className="h-2 bg-orange-500" aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4">
        <div>
          <div className="text-lg font-bold text-navy-900">{company.name}</div>
          <div className="text-sm text-navy-600">{company.type}</div>
        </div>
        <div className="flex items-center gap-4">
          {previewUrl ? (
            <img src={previewUrl} alt={company.name} className="h-14 max-w-[180px] rounded border-3 border-ink bg-white object-contain p-1" />
          ) : (
            <p className="text-sm text-navy-600">{t("noLogo")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept="image/png" onChange={handleFile} className="text-sm" />
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={!file || uploading}
            className="rounded-lg border-3 border-ink bg-gradient-to-b from-maroon-600 to-maroon-800 px-3 py-1.5 text-sm font-semibold text-white brutal-interactive disabled:opacity-50"
          >
            {uploading ? t("uploading") : t("upload")}
          </button>
        </div>
        {error && <p className="text-sm text-maroon-700">{error}</p>}
      </div>
    </li>
  );
}

export default function CompaniesPage() {
  const t = useTranslations("Companies");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();

  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<Company[]>("/companies")
      .then(setCompanies)
      .catch(() => setError(tc("errorGeneric")));
  }, [router, locale, tc, refreshKey]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href={`/${locale}/projects`} className="text-sm text-navy-700 underline">
          {t("back")}
        </Link>
        <h1 className="mb-2 mt-2 text-2xl font-extrabold tracking-tight text-navy-900">{t("title")}</h1>
        <p className="mb-4 text-sm text-navy-600">{t("intro")}</p>
        {error && <p className="text-maroon-700">{error}</p>}
        {!companies && !error && <p>{tc("loading")}</p>}
        {companies && companies.length === 0 && <p className="text-navy-600">{t("empty")}</p>}
        <ul className="flex flex-col gap-4">
          {companies?.map((c) => (
            <CompanyLogoCard key={c.id} company={c} onUploaded={() => setRefreshKey((k) => k + 1)} />
          ))}
        </ul>
      </main>
    </>
  );
}
