"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const t = useTranslations("ProjectNav");
  const locale = useLocale();
  const pathname = usePathname();

  const tabs = [
    { key: "directory", label: t("directory"), href: `/${locale}/projects/${projectId}/directory` },
    { key: "documents", label: t("documents"), href: `/${locale}/projects/${projectId}/documents` },
    { key: "drawings", label: t("drawings"), href: `/${locale}/projects/${projectId}/drawings` },
    { key: "daily-log", label: t("dailyLog"), href: `/${locale}/projects/${projectId}/daily-log` },
    { key: "punch-list", label: t("punchList"), href: `/${locale}/projects/${projectId}/punch-list` },
    { key: "photos", label: t("photos"), href: `/${locale}/projects/${projectId}/photos` },
  ];

  return (
    <nav className="border-b border-slate-200 px-4">
      <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${
                active ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
