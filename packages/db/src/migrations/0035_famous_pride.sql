CREATE TYPE "public"."esignature_document_type" AS ENUM('correspondence', 'inspection');--> statement-breakpoint
CREATE TABLE "esignatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"document_type" "esignature_document_type" NOT NULL,
	"document_id" uuid NOT NULL,
	"signer_user_id" uuid NOT NULL,
	"signer_name" varchar(200) NOT NULL,
	"signature_image_base64" text,
	"content_hash" varchar(64) NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "esignatures" ADD CONSTRAINT "esignatures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esignatures" ADD CONSTRAINT "esignatures_signer_user_id_users_id_fk" FOREIGN KEY ("signer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "esignatures_document_idx" ON "esignatures" USING btree ("document_type","document_id");--> statement-breakpoint
CREATE INDEX "esignatures_project_id_idx" ON "esignatures" USING btree ("project_id");