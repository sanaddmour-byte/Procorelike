"use client";

import { Header } from "@/components/Header";
import { ProjectTabs } from "@/components/ProjectTabs";
import { apiJson } from "@/lib/api-client";
import { loadStoredAuth } from "@/lib/auth-storage";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  companyName: string;
}

export default function DirectoryPage() {
  const t = useTranslations("Directory");
  const tc = useTranslations("Common");
  const router = useRouter();
  const locale = useLocale();
  const params = useParams<{ id: string }>();

  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadStoredAuth()) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiJson<Member[]>(`/projects/${params.id}/members`)
      .then(setMembers)
      .catch(() => setError(tc("errorGeneric")));
  }, [router, locale, params.id, tc]);

  return (
    <>
      <Header />
      <ProjectTabs projectId={params.id} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${locale}/projects`} className="text-sm text-slate-600 underline">
          {t("back")}
        </Link>
        <h1 className="mb-4 mt-2 text-2xl font-semibold">{t("title")}</h1>
        {error && <p className="text-red-600">{error}</p>}
        {!members && !error && <p>{tc("loading")}</p>}
        {members && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 text-start">{t("name")}</th>
                  <th className="py-2 text-start">{t("email")}</th>
                  <th className="py-2 text-start">{t("role")}</th>
                  <th className="py-2 text-start">{t("company")}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-b border-slate-100">
                    <td className="py-2">{m.name}</td>
                    <td className="py-2">{m.email}</td>
                    <td className="py-2">{m.role}</td>
                    <td className="py-2">{m.companyName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
