import { index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { companies, costCodes, projects, users } from "./core";

// ---------------------------------------------------------------------------
// Prequalification: a company's fitness to bid on this project, scored and
// reviewed once per (project, company) pair -- kept project-scoped rather
// than a global company attribute, matching the project-scoped shape of
// every other permission-gated table in this schema (see PermissionContext,
// which is always resolved against one project).
// ---------------------------------------------------------------------------

export const prequalificationStatusEnum = pgEnum("prequalification_status", [
  "invited",
  "submitted",
  "under_review",
  "qualified",
  "disqualified",
]);

export const prequalifications = pgTable(
  "prequalifications",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    status: prequalificationStatusEnum("status").notNull().default("invited"),
    /** Procore's Prequalification form fields: bonding capacity, EMR (Experience Modification Rate -- the standard OSHA-derived safety metric), annual revenue, years in business, and free-text references -- all optional until the company submits. */
    bondingCapacity: numeric("bonding_capacity", { precision: 14, scale: 2 }),
    experienceModRate: numeric("experience_mod_rate", { precision: 4, scale: 2 }),
    annualRevenue: numeric("annual_revenue", { precision: 14, scale: 2 }),
    yearsInBusiness: numeric("years_in_business", { precision: 4, scale: 0 }),
    referencesText: text("references_text"),
    /** Reviewer-only fields, set on the under_review -> qualified/disqualified transition. */
    overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
    reviewNotes: text("review_notes"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [
    index("prequalifications_project_id_idx").on(table.projectId),
    uniqueIndex("prequalifications_project_company_unique").on(table.projectId, table.companyId),
  ],
);

// ---------------------------------------------------------------------------
// Bidding: a bid package (scope of work put out to bid) invites companies,
// which submit bids; awarding one bid rejects the rest and can optionally
// spin up a Commitment (packages/financial.ts) in the same step, mirroring
// Procore's own Bid Package -> Award -> Commitment flow.
// ---------------------------------------------------------------------------

export const bidPackageStatusEnum = pgEnum("bid_package_status", ["draft", "open", "closed", "awarded", "canceled"]);
export const bidInvitationStatusEnum = pgEnum("bid_invitation_status", ["invited", "viewing", "declined", "submitted"]);
export const bidStatusEnum = pgEnum("bid_status", ["submitted", "shortlisted", "awarded", "rejected"]);

export const bidPackages = pgTable(
  "bid_packages",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    number: varchar("number", { length: 50 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    /** The trade/scope this package covers -- optional since not every bid maps cleanly to one cost code. */
    costCodeId: uuid("cost_code_id").references(() => costCodes.id),
    status: bidPackageStatusEnum("status").notNull().default("draft"),
    dueDate: timestamp("due_date", { withTimezone: false, mode: "date" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("bid_packages_project_id_idx").on(table.projectId)],
);

export const bidInvitations = pgTable(
  "bid_invitations",
  {
    id: idColumn(),
    bidPackageId: uuid("bid_package_id")
      .notNull()
      .references(() => bidPackages.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    status: bidInvitationStatusEnum("status").notNull().default("invited"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    index("bid_invitations_bid_package_id_idx").on(table.bidPackageId),
    uniqueIndex("bid_invitations_package_company_unique").on(table.bidPackageId, table.companyId),
  ],
);

/**
 * Logged by a GC-side user on the bidder's behalf (the `bids.companyId` /
 * `createdBy` split), the same pattern tm_tickets uses for a subcontractor's
 * work -- this app has no public, unauthenticated bid-portal for a bidder to
 * submit directly, so entering a received bid is itself the recorded action.
 */
export const bids = pgTable(
  "bids",
  {
    id: idColumn(),
    bidPackageId: uuid("bid_package_id")
      .notNull()
      .references(() => bidPackages.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    /** Ordered list of { description, amount } -- priced options outside the base bid, same shape a paper bid form would list them in. */
    alternates: jsonb("alternates").notNull().default([]).$type<{ description: string; amount: number }[]>(),
    exclusions: text("exclusions"),
    status: bidStatusEnum("status").notNull().default("submitted"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index("bids_bid_package_id_idx").on(table.bidPackageId),
    uniqueIndex("bids_package_company_unique").on(table.bidPackageId, table.companyId),
  ],
);

// ---------------------------------------------------------------------------
// Estimating: a cost estimate built from cost-coded line items, which a
// "final" estimate can push into the Budget (packages/financial.ts) as a
// starting point -- Procore's own Estimating -> Budget handoff.
// ---------------------------------------------------------------------------

export const estimateStatusEnum = pgEnum("estimate_status", ["draft", "final"]);

export const estimates = pgTable(
  "estimates",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    number: varchar("number", { length: 50 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    status: estimateStatusEnum("status").notNull().default("draft"),
    /** Set once the estimate has been pushed into the Budget -- blocks a second push from silently duplicating budget line items. */
    convertedToBudgetAt: timestamp("converted_to_budget_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [index("estimates_project_id_idx").on(table.projectId)],
);

export const estimateLineItems = pgTable(
  "estimate_line_items",
  {
    id: idColumn(),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimates.id),
    costCodeId: uuid("cost_code_id")
      .notNull()
      .references(() => costCodes.id),
    description: varchar("description", { length: 300 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 2 }).notNull(),
    unit: varchar("unit", { length: 50 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [index("estimate_line_items_estimate_id_idx").on(table.estimateId)],
);
