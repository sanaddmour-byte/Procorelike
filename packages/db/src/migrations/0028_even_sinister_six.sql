CREATE TYPE "public"."change_event_status" AS ENUM('open', 'incorporated', 'void');--> statement-breakpoint
CREATE TYPE "public"."change_reason" AS ENUM('owner_change', 'design_development', 'allowance', 'value_engineering', 'unforeseen_condition', 'errors_omissions', 'rfi', 'other');--> statement-breakpoint
ALTER TABLE "change_events" ADD COLUMN "status" "change_event_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_events" ADD COLUMN "reason" "change_reason" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_orders" ADD COLUMN "title" varchar(300);--> statement-breakpoint
ALTER TABLE "change_orders" ADD COLUMN "reason" "change_reason" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_orders" ADD COLUMN "executed" boolean DEFAULT false NOT NULL;