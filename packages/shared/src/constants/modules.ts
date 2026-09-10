export const MODULES = [
  "directory",
  "documents",
  "drawings",
  "rfis",
  "submittals",
  "daily_log",
  "punch_list",
  "photos",
  "inspections",
  "budget",
  "commitments",
  "change_management",
  "progress_billing",
  "meetings",
  "schedule",
  "safety",
  "tm_tickets",
  "reports",
  "correspondence",
] as const;

export type Module = (typeof MODULES)[number];

export function isModule(value: string): value is Module {
  return (MODULES as readonly string[]).includes(value);
}

/**
 * Financial/commercial modules a client_viewer must never see cost data for,
 * per the hard rule in docs/DATA_MODEL.md §10 — enforced at both the
 * permission engine and the RLS layer, not just the UI.
 */
export const FINANCIAL_MODULES: readonly Module[] = [
  "budget",
  "commitments",
  "change_management",
  "progress_billing",
];
