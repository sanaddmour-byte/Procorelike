CREATE TABLE "pdf_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"record_type" varchar(100) NOT NULL,
	"record_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"comment_text" text NOT NULL,
	"linked_rfi_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pdf_comments" ADD CONSTRAINT "pdf_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_comments" ADD CONSTRAINT "pdf_comments_linked_rfi_id_rfis_id_fk" FOREIGN KEY ("linked_rfi_id") REFERENCES "public"."rfis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_comments" ADD CONSTRAINT "pdf_comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pdf_comments_record_idx" ON "pdf_comments" USING btree ("record_type","record_id");--> statement-breakpoint
CREATE INDEX "pdf_comments_linked_rfi_idx" ON "pdf_comments" USING btree ("linked_rfi_id");