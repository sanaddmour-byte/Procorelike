"use client";

import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface SpecSectionSubmittal {
  id: string;
  number: string;
  title: string;
  status: "draft" | "in_review" | "approved" | "closed";
}

interface SpecSectionLinkedRfi {
  id: string;
  number: string;
  subject: string;
  status: string;
}

interface SpecSectionDetail {
  id: string;
  projectId: string;
  csiCode: string;
  title: string;
  submittals: SpecSectionSubmittal[];
  linkedRfis: SpecSectionLinkedRfi[];
}

export default function SpecSectionDetailScreen() {
  const t = useTranslations("Specifications");
  const ts = useTranslations("Submittals");
  const tr = useTranslations("Rfis");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string; specSectionId: string }>();

  const [section, setSection] = useState<SpecSectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await apiJson<SpecSectionDetail>(`/submittals/spec-sections/${params.specSectionId}`);
      setSection(detail);
    } catch {
      setError(tc("errorGeneric"));
    }
  }, [params.specSectionId, tc]);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
  }, [router, locale, load]);

  function submittalStatusLabel(status: SpecSectionSubmittal["status"]): string {
    return {
      draft: ts("statusDraft"),
      in_review: ts("statusInReview"),
      approved: ts("statusApproved"),
      closed: ts("statusClosed"),
    }[status];
  }

  function rfiStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: tr("statusDraft"),
      open: tr("statusOpen"),
      answered: tr("statusAnswered"),
      closed: tr("statusClosed"),
    };
    return labels[status] ?? status;
  }

  if (!section) {
    return (
      <>
        <main className="mx-auto max-w-3xl px-4 py-8">{error ? <p className="text-maroon-700">{error}</p> : <p>{tc("loading")}</p>}</main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects/${params.id}/submittals`} className="mb-4 inline-block text-sm text-navy-600 underline">
          {t("back")}
        </Link>
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-navy-900">
          {section.csiCode} — {section.title}
        </h1>
        {error && <p className="text-maroon-700">{error}</p>}

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-medium">{t("submittalsInSection")}</h2>
          {section.submittals.length === 0 ? (
            <p className="text-navy-600">{t("noSubmittals")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {section.submittals.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/${locale}/projects/${params.id}/submittals/${s.id}`}
                    className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-3 shadow-brutal-sm brutal-interactive"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {s.number} — {s.title}
                      </span>
                      <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                        {submittalStatusLabel(s.status)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">{t("linkedRfis")}</h2>
          {section.linkedRfis.length === 0 ? (
            <p className="text-navy-600">{t("noLinkedRfis")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {section.linkedRfis.map((rfi) => (
                <li key={rfi.id}>
                  <Link
                    href={`/${locale}/projects/${params.id}/rfis/${rfi.id}`}
                    className="block rounded-xl border-3 border-ink bg-gradient-to-b from-white to-cream p-3 shadow-brutal-sm brutal-interactive"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {rfi.number} — {rfi.subject}
                      </span>
                      <span className="whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-xs text-navy-800">
                        {rfiStatusLabel(rfi.status)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
