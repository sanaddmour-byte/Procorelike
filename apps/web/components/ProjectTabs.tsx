"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const t = useTranslations("ProjectNav");
  const locale = useLocale();
  const pathname = usePathname();

  const tabs = [
    { key: "dashboard", label: t("dashboard"), href: `/${locale}/projects/${projectId}/dashboard` },
    { key: "directory", label: t("directory"), href: `/${locale}/projects/${projectId}/directory` },
    { key: "documents", label: t("documents"), href: `/${locale}/projects/${projectId}/documents` },
    { key: "drawings", label: t("drawings"), href: `/${locale}/projects/${projectId}/drawings` },
    { key: "rfis", label: t("rfis"), href: `/${locale}/projects/${projectId}/rfis` },
    { key: "submittals", label: t("submittals"), href: `/${locale}/projects/${projectId}/submittals` },
    { key: "inspections", label: t("inspections"), href: `/${locale}/projects/${projectId}/inspections` },
    { key: "daily-log", label: t("dailyLog"), href: `/${locale}/projects/${projectId}/daily-log` },
    { key: "punch-list", label: t("punchList"), href: `/${locale}/projects/${projectId}/punch-list` },
    { key: "photos", label: t("photos"), href: `/${locale}/projects/${projectId}/photos` },
    { key: "budget", label: t("budget"), href: `/${locale}/projects/${projectId}/budget` },
    { key: "commitments", label: t("commitments"), href: `/${locale}/projects/${projectId}/commitments` },
    { key: "change-orders", label: t("changeOrders"), href: `/${locale}/projects/${projectId}/change-orders` },
    { key: "billing", label: t("billing"), href: `/${locale}/projects/${projectId}/billing` },
    { key: "meetings", label: t("meetings"), href: `/${locale}/projects/${projectId}/meetings` },
    { key: "schedule", label: t("schedule"), href: `/${locale}/projects/${projectId}/schedule` },
    { key: "safety", label: t("safety"), href: `/${locale}/projects/${projectId}/safety` },
  ];

  return (
    <nav className="border-b-3 border-ink bg-white px-4">
      <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`whitespace-nowrap border-b-4 px-3 py-3 text-sm font-semibold transition-colors ${
                active ? "border-maroon-600 text-maroon-700" : "border-transparent text-navy-600 hover:text-navy-900"
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
