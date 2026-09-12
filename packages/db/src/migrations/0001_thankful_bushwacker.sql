ALTER TABLE "daily_logs" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "conflict_data" jsonb;--> statement-breakpoint
ALTER TABLE "punch_items" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "punch_items" ADD COLUMN "conflict_data" jsonb;