ALTER TABLE "daily_logs" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "punch_items" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;