/** Illustration shown at the top of each module's list page (one shared flat style: navy / orange / cream). Keyed by the URL segment after /projects/<id>/. */
const FINANCE = "finance";
const SCHEDULE = "schedule";

const FILE_BY_SEGMENT: Record<string, string> = {
  "my-work": "my-work",
  dashboard: "dashboard",
  analytics: "dashboard",
  "daily-log": "daily-log",
  inspections: "inspections",
  "punch-list": "punch-list",
  photos: "photos",
  safety: "safety",
  "tm-tickets": "tm-tickets",
  documents: "documents",
  specifications: "documents",
  drawings: "drawings",
  transmittals: "correspondence",
  correspondence: "correspondence",
  rfis: "rfis",
  submittals: "submittals",
  meetings: "meetings",
  budget: FINANCE,
  "prime-contract": FINANCE,
  commitments: FINANCE,
  "change-orders": FINANCE,
  "direct-costs": FINANCE,
  billing: FINANCE,
  prequalification: FINANCE,
  bidding: FINANCE,
  estimating: FINANCE,
  schedule: SCHEDULE,
  gantt: SCHEDULE,
  lookahead: SCHEDULE,
  "progress-updates": SCHEDULE,
};

export interface ModuleIllustration {
  src: string;
  /** True on a record page (one level below the list); the banner is smaller there. */
  detail: boolean;
}

/** The illustration for the module a project page belongs to, for list pages and the record pages beneath them. */
export function moduleIllustration(pathname: string): ModuleIllustration | null {
  const parts = pathname.split("/").filter(Boolean);
  // [locale, "projects", projectId, segment, ...record]
  if (parts.length < 4 || parts[1] !== "projects") return null;
  const file = FILE_BY_SEGMENT[parts[3] ?? ""];
  return file ? { src: `/images/modules/${file}.png`, detail: parts.length > 4 } : null;
}

/** Returns the illustration path for a list-level project page, or null for record pages and pages without one. */
export function moduleIllustrationFor(pathname: string): string | null {
  const found = moduleIllustration(pathname);
  return found && !found.detail ? found.src : null;
}
