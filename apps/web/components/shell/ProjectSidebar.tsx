"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  key: string;
  labelKey: string;
  segment: string;
}

interface NavGroup {
  key: string;
  groupLabelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { key: "project", groupLabelKey: "groupProject", items: [{ key: "dashboard", labelKey: "dashboard", segment: "dashboard" }] },
  {
    key: "field",
    groupLabelKey: "groupField",
    items: [
      { key: "daily-log", labelKey: "dailyLog", segment: "daily-log" },
      { key: "inspections", labelKey: "inspections", segment: "inspections" },
      { key: "punch-list", labelKey: "punchList", segment: "punch-list" },
      { key: "photos", labelKey: "photos", segment: "photos" },
      { key: "safety", labelKey: "safety", segment: "safety" },
      { key: "tm-tickets", labelKey: "tmTickets", segment: "tm-tickets" },
    ],
  },
  {
    key: "documents",
    groupLabelKey: "groupDocuments",
    items: [
      { key: "documents", labelKey: "documents", segment: "documents" },
      { key: "drawings", labelKey: "drawings", segment: "drawings" },
      { key: "transmittals", labelKey: "transmittals", segment: "transmittals" },
      { key: "rfis", labelKey: "rfis", segment: "rfis" },
      { key: "submittals", labelKey: "submittals", segment: "submittals" },
      { key: "correspondence", labelKey: "correspondence", segment: "correspondence" },
      { key: "meetings", labelKey: "meetings", segment: "meetings" },
    ],
  },
  {
    key: "financial",
    groupLabelKey: "groupFinancial",
    items: [
      { key: "budget", labelKey: "budget", segment: "budget" },
      { key: "commitments", labelKey: "commitments", segment: "commitments" },
      { key: "change-orders", labelKey: "changeOrders", segment: "change-orders" },
      { key: "direct-costs", labelKey: "directCosts", segment: "direct-costs" },
      { key: "prime-contract", labelKey: "primeContract", segment: "prime-contract" },
      { key: "billing", labelKey: "billing", segment: "billing" },
      { key: "prequalification", labelKey: "prequalification", segment: "prequalification" },
      { key: "bidding", labelKey: "bidding", segment: "bidding" },
      { key: "estimating", labelKey: "estimating", segment: "estimating" },
    ],
  },
  {
    key: "schedule",
    groupLabelKey: "groupSchedule",
    items: [
      { key: "schedule", labelKey: "schedule", segment: "schedule" },
      { key: "gantt", labelKey: "gantt", segment: "gantt" },
      { key: "lookahead", labelKey: "lookahead", segment: "lookahead" },
      { key: "progress-updates", labelKey: "progressUpdates", segment: "progress-updates" },
    ],
  },
  {
    key: "people",
    groupLabelKey: "groupPeople",
    items: [
      { key: "directory", labelKey: "directory", segment: "directory" },
      { key: "permissions", labelKey: "permissions", segment: "permissions" },
      { key: "settings", labelKey: "settings", segment: "settings" },
    ],
  },
];

interface Props {
  projectId: string;
  collapsed: boolean;
  /** Called after a link is clicked -- lets the mobile drawer close itself. */
  onNavigate?: () => void;
}

export function ProjectSidebar({ projectId, collapsed, onNavigate }: Props) {
  const t = useTranslations("ProjectNav");
  const tShell = useTranslations("Shell");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={tShell("projectNavigation")} className="flex h-full flex-col gap-4 overflow-y-auto px-2 py-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.key}>
          {!collapsed && <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-navy-400">{tShell(group.groupLabelKey)}</p>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = `/${locale}/projects/${projectId}/${item.segment}`;
              const active = pathname.startsWith(href);
              return (
                <li key={item.key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    title={collapsed ? t(item.labelKey) : undefined}
                    className={`block truncate rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                      active ? "bg-maroon-50 text-maroon-700" : "text-navy-700 hover:bg-navy-50 hover:text-navy-900"
                    }`}
                  >
                    {collapsed ? (
                      <>
                        <span aria-hidden="true">{t(item.labelKey).slice(0, 1)}</span>
                        <span className="sr-only">{t(item.labelKey)}</span>
                      </>
                    ) : (
                      t(item.labelKey)
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
