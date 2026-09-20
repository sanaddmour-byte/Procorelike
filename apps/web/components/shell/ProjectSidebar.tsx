"use client";

import {
  BadgeCheck,
  BarChart3,
  Calculator,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileCheck,
  FileDiff,
  FileSignature,
  FileText,
  GanttChart,
  Gavel,
  HelpCircle,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Mail,
  PencilRuler,
  Receipt,
  ScrollText,
  Send,
  Settings,
  ShieldAlert,
  Telescope,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  key: string;
  labelKey: string;
  segment: string;
  icon: LucideIcon;
}

interface NavGroup {
  key: string;
  groupLabelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: "project",
    groupLabelKey: "groupProject",
    items: [
      { key: "dashboard", labelKey: "dashboard", segment: "dashboard", icon: LayoutDashboard },
      { key: "analytics", labelKey: "analytics", segment: "analytics", icon: BarChart3 },
    ],
  },
  {
    key: "field",
    groupLabelKey: "groupField",
    items: [
      { key: "daily-log", labelKey: "dailyLog", segment: "daily-log", icon: ClipboardList },
      { key: "inspections", labelKey: "inspections", segment: "inspections", icon: ClipboardCheck },
      { key: "punch-list", labelKey: "punchList", segment: "punch-list", icon: ListChecks },
      { key: "photos", labelKey: "photos", segment: "photos", icon: ImageIcon },
      { key: "safety", labelKey: "safety", segment: "safety", icon: ShieldAlert },
      { key: "tm-tickets", labelKey: "tmTickets", segment: "tm-tickets", icon: Wrench },
    ],
  },
  {
    key: "documents",
    groupLabelKey: "groupDocuments",
    items: [
      { key: "documents", labelKey: "documents", segment: "documents", icon: FileText },
      { key: "drawings", labelKey: "drawings", segment: "drawings", icon: PencilRuler },
      { key: "transmittals", labelKey: "transmittals", segment: "transmittals", icon: Send },
      { key: "rfis", labelKey: "rfis", segment: "rfis", icon: HelpCircle },
      { key: "submittals", labelKey: "submittals", segment: "submittals", icon: FileCheck },
      { key: "correspondence", labelKey: "correspondence", segment: "correspondence", icon: Mail },
      { key: "meetings", labelKey: "meetings", segment: "meetings", icon: CalendarDays },
    ],
  },
  {
    key: "financial",
    groupLabelKey: "groupFinancial",
    items: [
      { key: "budget", labelKey: "budget", segment: "budget", icon: Wallet },
      { key: "commitments", labelKey: "commitments", segment: "commitments", icon: FileSignature },
      { key: "change-orders", labelKey: "changeOrders", segment: "change-orders", icon: FileDiff },
      { key: "direct-costs", labelKey: "directCosts", segment: "direct-costs", icon: CreditCard },
      { key: "prime-contract", labelKey: "primeContract", segment: "prime-contract", icon: ScrollText },
      { key: "billing", labelKey: "billing", segment: "billing", icon: Receipt },
      { key: "prequalification", labelKey: "prequalification", segment: "prequalification", icon: BadgeCheck },
      { key: "bidding", labelKey: "bidding", segment: "bidding", icon: Gavel },
      { key: "estimating", labelKey: "estimating", segment: "estimating", icon: Calculator },
    ],
  },
  {
    key: "schedule",
    groupLabelKey: "groupSchedule",
    items: [
      { key: "schedule", labelKey: "schedule", segment: "schedule", icon: CalendarRange },
      { key: "gantt", labelKey: "gantt", segment: "gantt", icon: GanttChart },
      { key: "lookahead", labelKey: "lookahead", segment: "lookahead", icon: Telescope },
      { key: "progress-updates", labelKey: "progressUpdates", segment: "progress-updates", icon: TrendingUp },
    ],
  },
  {
    key: "people",
    groupLabelKey: "groupPeople",
    items: [
      { key: "directory", labelKey: "directory", segment: "directory", icon: Users },
      { key: "permissions", labelKey: "permissions", segment: "permissions", icon: KeyRound },
      { key: "settings", labelKey: "settings", segment: "settings", icon: Settings },
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
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    title={collapsed ? t(item.labelKey) : undefined}
                    className={`flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                      collapsed ? "justify-center" : ""
                    } ${active ? "bg-maroon-50 text-maroon-700" : "text-navy-700 hover:bg-navy-50 hover:text-navy-900"}`}
                  >
                    {collapsed ? (
                      <>
                        <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                        <span className="sr-only">{t(item.labelKey)}</span>
                      </>
                    ) : (
                      <>
                        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </>
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
