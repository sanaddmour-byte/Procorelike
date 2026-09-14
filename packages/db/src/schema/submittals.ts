import { boolean, index, integer, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { attachments, companies, projects, specificationsSections, users } from "./core";

export const submittalStatusEnum = pgEnum("submittal_status", [
  "draft",
  "in_review",
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
  "closed",
]);

export const submittalResponseCodeEnum = pgEnum("submittal_response_code", [
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
]);

export const submittals = pgTable(
  "submittals",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    number: varchar("number", { length: 50 }).notNull(),
    specSectionId: uuid("spec_section_id")
      .notNull()
      .references(() => specificationsSections.id),
    title: varchar("title", { length: 300 }).notNull(),
    status: submittalStatusEnum("status").notNull().default("draft"),
    ballInCourtUserId: uuid("ball_in_court_user_id").references(() => users.id),
    leadTimeDays: integer("lead_time_days"),
    requiredOnSiteDate: timestamp("required_on_site_date", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditColumns(),
  },
  (table) => [
    index("submittals_project_id_idx").on(table.projectId),
    index("submittals_ball_in_court_user_idx").on(table.ballInCourtUserId),
  ],
);

/** Additional personnel a submittal should notify/involve, alongside the single ballInCourtUserId -- mirrors rfis.ts's rfiDistribution. */
export const submittalDistribution = pgTable(
  "submittal_distribution",
  {
    id: idColumn(),
    submittalId: uuid("submittal_id")
      .notNull()
      .references(() => submittals.id),
    userId: uuid("user_id").references(() => users.id),
    companyId: uuid("company_id").references(() => companies.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("submittal_distribution_submittal_id_idx").on(table.submittalId)],
);

export const submittalPackages = pgTable(
  "submittal_packages",
  {
    id: idColumn(),
    submittalId: uuid("submittal_id")
      .notNull()
      .references(() => submittals.id),
    packageNumber: integer("package_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("submittal_packages_submittal_id_idx").on(table.submittalId)],
);

export const submittalRevisions = pgTable(
  "submittal_revisions",
  {
    id: idColumn(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => submittalPackages.id),
    revisionNumber: integer("revision_number").notNull(),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => attachments.id),
    submittedDate: timestamp("submitted_date", { withTimezone: true }).notNull(),
  },
  (table) => [index("submittal_revisions_package_id_idx").on(table.packageId)],
);

export const submittalReviews = pgTable(
  "submittal_reviews",
  {
    id: idColumn(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => submittalRevisions.id),
    reviewerUserId: uuid("reviewer_user_id")
      .notNull()
      .references(() => users.id),
    sequenceOrder: integer("sequence_order").notNull().default(1),
    isParallel: boolean("is_parallel").notNull().default(false),
    responseCode: submittalResponseCodeEnum("response_code"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [index("submittal_reviews_revision_id_idx").on(table.revisionId)],
);
