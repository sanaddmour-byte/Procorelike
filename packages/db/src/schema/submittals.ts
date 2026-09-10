import { boolean, integer, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";
import { attachments, projects, specificationsSections, users } from "./core";

export const submittalStatusEnum = pgEnum("submittal_status", [
  "draft",
  "in_review",
  "approved",
  "closed",
]);

export const submittalResponseCodeEnum = pgEnum("submittal_response_code", [
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
]);

export const submittals = pgTable("submittals", {
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
  ...auditColumns(),
});

export const submittalPackages = pgTable("submittal_packages", {
  id: idColumn(),
  submittalId: uuid("submittal_id")
    .notNull()
    .references(() => submittals.id),
  packageNumber: integer("package_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submittalRevisions = pgTable("submittal_revisions", {
  id: idColumn(),
  packageId: uuid("package_id")
    .notNull()
    .references(() => submittalPackages.id),
  revisionNumber: integer("revision_number").notNull(),
  attachmentId: uuid("attachment_id")
    .notNull()
    .references(() => attachments.id),
  submittedDate: timestamp("submitted_date", { withTimezone: true }).notNull(),
});

export const submittalReviews = pgTable("submittal_reviews", {
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
});
