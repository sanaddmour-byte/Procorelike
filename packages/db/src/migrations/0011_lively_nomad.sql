CREATE TYPE "public"."schedule_task_status" AS ENUM('not_started', 'in_progress', 'complete', 'delayed');--> statement-breakpoint
CREATE TYPE "public"."safety_incident_severity" AS ENUM('near_miss', 'minor', 'serious', 'critical');--> statement-breakpoint
CREATE TYPE "public"."safety_incident_status" AS ENUM('open', 'investigating', 'closed');--> statement-breakpoint
CREATE TYPE "public"."safety_observation_category" AS ENUM('unsafe_condition', 'unsafe_act', 'near_miss', 'good_catch');--> statement-breakpoint
CREATE TYPE "public"."safety_observation_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "schedule_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"status" "schedule_task_status" DEFAULT 'not_started' NOT NULL,
	"assigned_company_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"location_id" uuid,
	"severity" "safety_incident_severity" NOT NULL,
	"description" text NOT NULL,
	"involved_company_id" uuid,
	"injured_person_name" varchar(200),
	"status" "safety_incident_status" DEFAULT 'open' NOT NULL,
	"corrective_action" text,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"reported_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"location_id" uuid,
	"category" "safety_observation_category" NOT NULL,
	"description" text NOT NULL,
	"status" "safety_observation_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"reported_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_assigned_company_id_companies_id_fk" FOREIGN KEY ("assigned_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_involved_company_id_companies_id_fk" FOREIGN KEY ("involved_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_tasks_project_id_idx" ON "schedule_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "safety_incidents_project_id_idx" ON "safety_incidents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "safety_observations_project_id_idx" ON "safety_observations" USING btree ("project_id");