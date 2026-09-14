CREATE TYPE "public"."rfi_impact" AS ENUM('yes', 'no', 'na');--> statement-breakpoint
ALTER TABLE "rfis" ADD COLUMN "cost_impact" "rfi_impact" DEFAULT 'na' NOT NULL;--> statement-breakpoint
ALTER TABLE "rfis" ADD COLUMN "schedule_impact" "rfi_impact" DEFAULT 'na' NOT NULL;--> statement-breakpoint
ALTER TABLE "rfis" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rfis" ADD COLUMN "reference" varchar(200);