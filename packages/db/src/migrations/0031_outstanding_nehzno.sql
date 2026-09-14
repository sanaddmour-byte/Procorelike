CREATE TYPE "public"."transmittal_item_type" AS ENUM('document', 'drawing_revision', 'drawing_set');--> statement-breakpoint
CREATE TYPE "public"."transmittal_purpose" AS ENUM('for_review', 'for_approval', 'for_information', 'as_requested', 'for_construction', 'for_bid');--> statement-breakpoint
CREATE TYPE "public"."transmittal_status" AS ENUM('draft', 'sent');--> statement-breakpoint
CREATE TABLE "drawing_set_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawing_set_id" uuid NOT NULL,
	"drawing_revision_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"published_date" timestamp NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transmittal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transmittal_id" uuid NOT NULL,
	"item_type" "transmittal_item_type" NOT NULL,
	"item_id" uuid NOT NULL,
	"description" varchar(300) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transmittal_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transmittal_id" uuid NOT NULL,
	"user_id" uuid,
	"company_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transmittals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"transmittal_number" varchar(20) NOT NULL,
	"subject" varchar(300) NOT NULL,
	"purpose" "transmittal_purpose" NOT NULL,
	"message" text,
	"status" "transmittal_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drawing_set_items" ADD CONSTRAINT "drawing_set_items_drawing_set_id_drawing_sets_id_fk" FOREIGN KEY ("drawing_set_id") REFERENCES "public"."drawing_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_set_items" ADD CONSTRAINT "drawing_set_items_drawing_revision_id_drawing_revisions_id_fk" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_sets" ADD CONSTRAINT "drawing_sets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_sets" ADD CONSTRAINT "drawing_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittal_items" ADD CONSTRAINT "transmittal_items_transmittal_id_transmittals_id_fk" FOREIGN KEY ("transmittal_id") REFERENCES "public"."transmittals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittal_recipients" ADD CONSTRAINT "transmittal_recipients_transmittal_id_transmittals_id_fk" FOREIGN KEY ("transmittal_id") REFERENCES "public"."transmittals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittal_recipients" ADD CONSTRAINT "transmittal_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittal_recipients" ADD CONSTRAINT "transmittal_recipients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmittals" ADD CONSTRAINT "transmittals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawing_set_items_drawing_set_id_idx" ON "drawing_set_items" USING btree ("drawing_set_id");--> statement-breakpoint
CREATE INDEX "drawing_sets_project_id_idx" ON "drawing_sets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "transmittal_items_transmittal_id_idx" ON "transmittal_items" USING btree ("transmittal_id");--> statement-breakpoint
CREATE INDEX "transmittal_recipients_transmittal_id_idx" ON "transmittal_recipients" USING btree ("transmittal_id");--> statement-breakpoint
CREATE INDEX "transmittals_project_id_idx" ON "transmittals" USING btree ("project_id");