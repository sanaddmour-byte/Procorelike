CREATE TYPE "public"."direct_cost_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."direct_cost_type" AS ENUM('invoice', 'expense', 'payroll', 'other');--> statement-breakpoint
CREATE TYPE "public"."prime_contract_status" AS ENUM('draft', 'executed', 'closed');--> statement-breakpoint
CREATE TABLE "direct_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"cost_code_id" uuid NOT NULL,
	"vendor_company_id" uuid,
	"type" "direct_cost_type" DEFAULT 'invoice' NOT NULL,
	"description" varchar(300) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"incurred_date" timestamp NOT NULL,
	"status" "direct_cost_status" DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prime_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"contract_number" varchar(50) NOT NULL,
	"title" varchar(300) NOT NULL,
	"owner_company_id" uuid NOT NULL,
	"original_contract_sum" numeric(14, 2) DEFAULT '0' NOT NULL,
	"retention_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"executed_date" timestamp,
	"status" "prime_contract_status" DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "direct_costs" ADD CONSTRAINT "direct_costs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_costs" ADD CONSTRAINT "direct_costs_cost_code_id_cost_codes_id_fk" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_costs" ADD CONSTRAINT "direct_costs_vendor_company_id_companies_id_fk" FOREIGN KEY ("vendor_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_costs" ADD CONSTRAINT "direct_costs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_costs" ADD CONSTRAINT "direct_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_costs" ADD CONSTRAINT "direct_costs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prime_contracts" ADD CONSTRAINT "prime_contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prime_contracts" ADD CONSTRAINT "prime_contracts_owner_company_id_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prime_contracts" ADD CONSTRAINT "prime_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prime_contracts" ADD CONSTRAINT "prime_contracts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_costs_project_id_idx" ON "direct_costs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "direct_costs_cost_code_id_idx" ON "direct_costs" USING btree ("cost_code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prime_contracts_project_id_unique" ON "prime_contracts" USING btree ("project_id");