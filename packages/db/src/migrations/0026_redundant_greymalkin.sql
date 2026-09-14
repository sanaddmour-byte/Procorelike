CREATE TYPE "public"."submittal_type" AS ENUM('shop_drawings', 'product_data', 'samples', 'design_data', 'test_reports', 'certificates', 'manufacturer_instructions', 'manufacturer_field_reports', 'operation_maintenance_data', 'other');--> statement-breakpoint
ALTER TABLE "submittals" ADD COLUMN "submittal_type" "submittal_type" DEFAULT 'shop_drawings' NOT NULL;--> statement-breakpoint
ALTER TABLE "submittals" ADD COLUMN "responsible_contractor_company_id" uuid;--> statement-breakpoint
ALTER TABLE "submittals" ADD COLUMN "location" varchar(200);--> statement-breakpoint
ALTER TABLE "submittals" ADD COLUMN "received_from" varchar(200);--> statement-breakpoint
ALTER TABLE "submittals" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submittals" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_responsible_contractor_company_id_companies_id_fk" FOREIGN KEY ("responsible_contractor_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;