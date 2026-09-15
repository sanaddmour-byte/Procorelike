CREATE TYPE "public"."bid_invitation_status" AS ENUM('invited', 'viewing', 'declined', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."bid_package_status" AS ENUM('draft', 'open', 'closed', 'awarded', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."bid_status" AS ENUM('submitted', 'shortlisted', 'awarded', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."estimate_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TYPE "public"."prequalification_status" AS ENUM('invited', 'submitted', 'under_review', 'qualified', 'disqualified');--> statement-breakpoint
ALTER TYPE "public"."permission_module" ADD VALUE 'prequalification';--> statement-breakpoint
ALTER TYPE "public"."permission_module" ADD VALUE 'bidding';--> statement-breakpoint
ALTER TYPE "public"."permission_module" ADD VALUE 'estimating';--> statement-breakpoint
CREATE TABLE "bid_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bid_package_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" "bid_invitation_status" DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bid_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" varchar(50) NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"cost_code_id" uuid,
	"status" "bid_package_status" DEFAULT 'draft' NOT NULL,
	"due_date" timestamp,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bid_package_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"alternates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclusions" text,
	"status" "bid_status" DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" uuid NOT NULL,
	"cost_code_id" uuid NOT NULL,
	"description" varchar(300) NOT NULL,
	"quantity" numeric(14, 2) NOT NULL,
	"unit" varchar(50) NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" varchar(50) NOT NULL,
	"title" varchar(300) NOT NULL,
	"status" "estimate_status" DEFAULT 'draft' NOT NULL,
	"converted_to_budget_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prequalifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" "prequalification_status" DEFAULT 'invited' NOT NULL,
	"bonding_capacity" numeric(14, 2),
	"experience_mod_rate" numeric(4, 2),
	"annual_revenue" numeric(14, 2),
	"years_in_business" numeric(4, 0),
	"references_text" text,
	"overall_score" numeric(5, 2),
	"review_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bid_invitations" ADD CONSTRAINT "bid_invitations_bid_package_id_bid_packages_id_fk" FOREIGN KEY ("bid_package_id") REFERENCES "public"."bid_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_invitations" ADD CONSTRAINT "bid_invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_packages" ADD CONSTRAINT "bid_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_packages" ADD CONSTRAINT "bid_packages_cost_code_id_cost_codes_id_fk" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_packages" ADD CONSTRAINT "bid_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_packages" ADD CONSTRAINT "bid_packages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_bid_package_id_bid_packages_id_fk" FOREIGN KEY ("bid_package_id") REFERENCES "public"."bid_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_cost_code_id_cost_codes_id_fk" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prequalifications" ADD CONSTRAINT "prequalifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prequalifications" ADD CONSTRAINT "prequalifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prequalifications" ADD CONSTRAINT "prequalifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prequalifications" ADD CONSTRAINT "prequalifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prequalifications" ADD CONSTRAINT "prequalifications_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bid_invitations_bid_package_id_idx" ON "bid_invitations" USING btree ("bid_package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bid_invitations_package_company_unique" ON "bid_invitations" USING btree ("bid_package_id","company_id");--> statement-breakpoint
CREATE INDEX "bid_packages_project_id_idx" ON "bid_packages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "bids_bid_package_id_idx" ON "bids" USING btree ("bid_package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bids_package_company_unique" ON "bids" USING btree ("bid_package_id","company_id");--> statement-breakpoint
CREATE INDEX "estimate_line_items_estimate_id_idx" ON "estimate_line_items" USING btree ("estimate_id");--> statement-breakpoint
CREATE INDEX "estimates_project_id_idx" ON "estimates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "prequalifications_project_id_idx" ON "prequalifications" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prequalifications_project_company_unique" ON "prequalifications" USING btree ("project_id","company_id");