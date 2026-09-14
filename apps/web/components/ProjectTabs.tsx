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
    { key: "gantt", label: t("gantt"), href: `/${locale}/projects/${projectId}/gantt` },
    { key: "lookahead", label: t("lookahead"), href: `/${locale}/projects/${projectId}/lookahead` },
    { key: "progress-updates", label: t("progressUpdates"), href: `/${locale}/projects/${projectId}/progress-updates` },
    { key: "safety", label: t("safety"), href: `/${locale}/projects/${projectId}/safety` },
    { key: "tm-tickets", label: t("tmTickets"), href: `/${locale}/projects/${projectId}/tm-tickets` },
    { key: "correspondence", label: t("correspondence"), href: `/${locale}/projects/${projectId}/correspondence` },
  ];

  return (
    <nav className="relative border-b-3 border-ink bg-white">
      <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4">
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
      {/* Fade hints on both edges so a horizontally-scrollable tab strip (routine on phone-width screens) doesn't look like a tab was simply cut off. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" aria-hidden="true" />
    </nav>
  );
}
