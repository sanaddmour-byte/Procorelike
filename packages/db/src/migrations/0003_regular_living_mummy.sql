ALTER TABLE "rfis" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "rfis" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submittals" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittals" ADD CONSTRAINT "submittals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;