CREATE TYPE "public"."corrective_action_source_type" AS ENUM('safety_incident', 'safety_observation', 'inspection');--> statement-breakpoint
CREATE TYPE "public"."corrective_action_status" AS ENUM('open', 'in_progress', 'completed', 'verified');--> statement-breakpoint
CREATE TYPE "public"."injury_illness_type" AS ENUM('injury', 'skin_disorder', 'respiratory_condition', 'poisoning', 'hearing_loss', 'other_illness');--> statement-breakpoint
CREATE TYPE "public"."osha_classification" AS ENUM('not_recordable', 'death', 'days_away_from_work', 'job_transfer_or_restriction', 'other_recordable');--> statement-breakpoint
CREATE TABLE "corrective_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_type" "corrective_action_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"description" text NOT NULL,
	"assigned_to_user_id" uuid NOT NULL,
	"due_date" timestamp NOT NULL,
	"status" "corrective_action_status" DEFAULT 'open' NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD COLUMN "osha_classification" "osha_classification" DEFAULT 'not_recordable' NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD COLUMN "injury_illness_type" "injury_illness_type";--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD COLUMN "body_part" varchar(200);--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD COLUMN "days_away_from_work" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD COLUMN "days_job_transfer_or_restriction" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corrective_actions_project_id_idx" ON "corrective_actions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "corrective_actions_source_idx" ON "corrective_actions" USING btree ("source_type","source_id");