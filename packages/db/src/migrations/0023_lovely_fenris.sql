CREATE TABLE "pdf_sketches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"record_type" varchar(100) NOT NULL,
	"record_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"points" jsonb NOT NULL,
	"color" varchar(7) DEFAULT '#dc2626' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pdf_sketches" ADD CONSTRAINT "pdf_sketches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_sketches" ADD CONSTRAINT "pdf_sketches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pdf_sketches_record_idx" ON "pdf_sketches" USING btree ("record_type","record_id");