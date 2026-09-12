ALTER TABLE "budget_line_items" ADD COLUMN "created_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;