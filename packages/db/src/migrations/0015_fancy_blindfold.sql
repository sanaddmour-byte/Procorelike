CREATE TYPE "public"."schedule_source_tool" AS ENUM('manual', 'ms_project_xml', 'p6_xer', 'p6_xml', 'csv');--> statement-breakpoint
CREATE TYPE "public"."schedule_task_constraint" AS ENUM('asap', 'alap', 'snet', 'snlt', 'fnet', 'fnlt', 'mso', 'mfo');--> statement-breakpoint
CREATE TYPE "public"."schedule_task_type" AS ENUM('task', 'summary', 'milestone', 'loe', 'wbs');--> statement-breakpoint
CREATE TYPE "public"."task_dependency_type" AS ENUM('FS', 'SS', 'FF', 'SF');--> statement-breakpoint
CREATE TABLE "calendar_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_working" boolean NOT NULL,
	"working_minutes" integer,
	"label" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"hours_per_day" numeric(4, 2) DEFAULT '8' NOT NULL,
	"working_days" integer DEFAULT 31 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"external_id" varchar(200),
	"wbs_code" varchar(200),
	"parent_task_id" uuid,
	"name" varchar(500) NOT NULL,
	"task_type" "schedule_task_type" DEFAULT 'task' NOT NULL,
	"duration_minutes" integer,
	"calendar_id" uuid,
	"early_start" timestamp with time zone,
	"early_finish" timestamp with time zone,
	"late_start" timestamp with time zone,
	"late_finish" timestamp with time zone,
	"planned_start" timestamp with time zone,
	"planned_finish" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_finish" timestamp with time zone,
	"total_float_minutes" integer,
	"free_float_minutes" integer,
	"is_critical" boolean DEFAULT false NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"physical_percent_complete" integer,
	"constraint_type" "schedule_task_constraint",
	"constraint_date" timestamp with time zone,
	"responsible_company_id" uuid,
	"trade_id" uuid,
	"location_id" uuid,
	"cost_code_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookahead_commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lookahead_plan_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"promised_finish" date NOT NULL,
	"committed_by_company_id" uuid NOT NULL,
	"actual_finish" date,
	"reason_code" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "lookahead_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"horizon_weeks" integer DEFAULT 3 NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"data_date" date NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"baseline_label" varchar(200),
	"imported_from" "schedule_source_tool" NOT NULL,
	"imported_by" uuid NOT NULL,
	"source_file_attachment_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_tool" "schedule_source_tool" DEFAULT 'manual' NOT NULL,
	"default_calendar_id" uuid,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_baseline_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"baseline_version_id" uuid NOT NULL,
	"planned_start" timestamp with time zone,
	"planned_finish" timestamp with time zone,
	"duration_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"predecessor_id" uuid NOT NULL,
	"successor_id" uuid NOT NULL,
	"type" "task_dependency_type" DEFAULT 'FS' NOT NULL,
	"lag_minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_version_id_schedule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_responsible_company_id_companies_id_fk" FOREIGN KEY ("responsible_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_cost_code_id_cost_codes_id_fk" FOREIGN KEY ("cost_code_id") REFERENCES "public"."cost_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookahead_commitments" ADD CONSTRAINT "lookahead_commitments_lookahead_plan_id_lookahead_plans_id_fk" FOREIGN KEY ("lookahead_plan_id") REFERENCES "public"."lookahead_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookahead_commitments" ADD CONSTRAINT "lookahead_commitments_task_id_schedule_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookahead_commitments" ADD CONSTRAINT "lookahead_commitments_committed_by_company_id_companies_id_fk" FOREIGN KEY ("committed_by_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookahead_plans" ADD CONSTRAINT "lookahead_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookahead_plans" ADD CONSTRAINT "lookahead_plans_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookahead_plans" ADD CONSTRAINT "lookahead_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_source_file_attachment_id_attachments_id_fk" FOREIGN KEY ("source_file_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_baseline_values" ADD CONSTRAINT "task_baseline_values_task_id_schedule_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_baseline_values" ADD CONSTRAINT "task_baseline_values_baseline_version_id_schedule_versions_id_fk" FOREIGN KEY ("baseline_version_id") REFERENCES "public"."schedule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_id_schedule_tasks_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_id_schedule_tasks_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_exceptions_calendar_id_idx" ON "calendar_exceptions" USING btree ("calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_exceptions_calendar_id_date_unique" ON "calendar_exceptions" USING btree ("calendar_id","date");--> statement-breakpoint
CREATE INDEX "calendars_project_id_idx" ON "calendars" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "schedule_tasks_version_id_idx" ON "schedule_tasks" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "schedule_tasks_external_id_idx" ON "schedule_tasks" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "schedule_tasks_wbs_code_idx" ON "schedule_tasks" USING btree ("wbs_code");--> statement-breakpoint
CREATE INDEX "lookahead_commitments_lookahead_plan_id_idx" ON "lookahead_commitments" USING btree ("lookahead_plan_id");--> statement-breakpoint
CREATE INDEX "lookahead_plans_project_id_idx" ON "lookahead_plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "schedule_versions_schedule_id_idx" ON "schedule_versions" USING btree ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_versions_schedule_id_version_no_unique" ON "schedule_versions" USING btree ("schedule_id","version_no");--> statement-breakpoint
CREATE INDEX "schedules_project_id_idx" ON "schedules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_baseline_values_task_id_idx" ON "task_baseline_values" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_baseline_values_task_baseline_unique" ON "task_baseline_values" USING btree ("task_id","baseline_version_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_predecessor_id_idx" ON "task_dependencies" USING btree ("predecessor_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_successor_id_idx" ON "task_dependencies" USING btree ("successor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_dependencies_pred_succ_type_unique" ON "task_dependencies" USING btree ("predecessor_id","successor_id","type");