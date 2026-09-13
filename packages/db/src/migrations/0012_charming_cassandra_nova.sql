ALTER TABLE "safety_incidents" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "safety_observations" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_observations" ADD CONSTRAINT "safety_observations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;