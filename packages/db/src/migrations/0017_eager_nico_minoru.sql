CREATE TYPE "public"."lookahead_commitment_status" AS ENUM('promised', 'confirmed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."schedule_constraint_category" AS ENUM('design', 'material', 'permit', 'access', 'labour', 'prerequisite', 'other');--> statement-breakpoint
CREATE TYPE "public"."schedule_constraint_status" AS ENUM('open', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."schedule_progress_update_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "schedule_constraints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"category" "schedule_constraint_category" NOT NULL,
	"description" text NOT NULL,
	"owner_company_id" uuid,
	"need_by_date" date NOT NULL,
	"status" "schedule_constraint_status" DEFAULT 'open' NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_progress_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"proposed_percent_complete" integer,
	"proposed_actual_start" timestamp with time zone,
	"proposed_actual_finish" timestamp with time zone,
	"note" text,
	"photo_attachment_id" uuid,
	"status" "schedule_progress_update_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_log_delays" ADD COLUMN "schedule_task_id" uuid;--> statement-breakpoint
ALTER TABLE "lookahead_commitments" ADD COLUMN "status" "lookahead_commitment_status" DEFAULT 'promised' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_constraints" ADD CONSTRAINT "schedule_constraints_task_id_schedule_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_constraints" ADD CONSTRAINT "schedule_constraints_owner_company_id_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_constraints" ADD CONSTRAINT "schedule_constraints_cleared_by_users_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_constraints" ADD CONSTRAINT "schedule_constraints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_progress_updates" ADD CONSTRAINT "schedule_progress_updates_task_id_schedule_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_progress_updates" ADD CONSTRAINT "schedule_progress_updates_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_progress_updates" ADD CONSTRAINT "schedule_progress_updates_photo_attachment_id_attachments_id_fk" FOREIGN KEY ("photo_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_progress_updates" ADD CONSTRAINT "schedule_progress_updates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_constraints_task_id_idx" ON "schedule_constraints" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "schedule_progress_updates_task_id_idx" ON "schedule_progress_updates" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "daily_log_delays" ADD CONSTRAINT "daily_log_delays_schedule_task_id_schedule_tasks_id_fk" FOREIGN KEY ("schedule_task_id") REFERENCES "public"."schedule_tasks"("id") ON DELETE no action ON UPDATE no action;