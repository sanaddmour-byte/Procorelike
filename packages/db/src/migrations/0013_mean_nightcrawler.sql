CREATE TYPE "public"."correspondence_direction" AS ENUM('incoming', 'outgoing');--> statement-breakpoint
CREATE TYPE "public"."correspondence_status" AS ENUM('draft', 'sent', 'acknowledged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."correspondence_type" AS ENUM('letter', 'notice', 'transmittal', 'memo');--> statement-breakpoint
CREATE TYPE "public"."tm_ticket_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "correspondence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"correspondence_number" varchar(20) NOT NULL,
	"direction" "correspondence_direction" NOT NULL,
	"type" "correspondence_type" NOT NULL,
	"subject" varchar(300) NOT NULL,
	"body" text NOT NULL,
	"from_company_id" uuid NOT NULL,
	"to_company_id" uuid NOT NULL,
	"sent_date" timestamp,
	"response_required_by" timestamp,
	"status" "correspondence_status" DEFAULT 'draft' NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tm_ticket_equipment_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"description" varchar(300) NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"rate" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tm_ticket_labor_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"worker_name" varchar(200) NOT NULL,
	"trade" varchar(100),
	"hours" numeric(6, 2) NOT NULL,
	"rate" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tm_ticket_material_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"description" varchar(300) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" varchar(50) NOT NULL,
	"unit_cost" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tm_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"ticket_number" varchar(20) NOT NULL,
	"company_id" uuid NOT NULL,
	"work_date" timestamp NOT NULL,
	"description" text NOT NULL,
	"status" "tm_ticket_status" DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_from_company_id_companies_id_fk" FOREIGN KEY ("from_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_to_company_id_companies_id_fk" FOREIGN KEY ("to_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correspondence" ADD CONSTRAINT "correspondence_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_ticket_equipment_entries" ADD CONSTRAINT "tm_ticket_equipment_entries_ticket_id_tm_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tm_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_ticket_labor_entries" ADD CONSTRAINT "tm_ticket_labor_entries_ticket_id_tm_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tm_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_ticket_material_entries" ADD CONSTRAINT "tm_ticket_material_entries_ticket_id_tm_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tm_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_tickets" ADD CONSTRAINT "tm_tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_tickets" ADD CONSTRAINT "tm_tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_tickets" ADD CONSTRAINT "tm_tickets_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_tickets" ADD CONSTRAINT "tm_tickets_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_tickets" ADD CONSTRAINT "tm_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_tickets" ADD CONSTRAINT "tm_tickets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correspondence_project_id_idx" ON "correspondence" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tm_ticket_equipment_entries_ticket_id_idx" ON "tm_ticket_equipment_entries" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tm_ticket_labor_entries_ticket_id_idx" ON "tm_ticket_labor_entries" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tm_ticket_material_entries_ticket_id_idx" ON "tm_ticket_material_entries" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tm_tickets_project_id_idx" ON "tm_tickets" USING btree ("project_id");