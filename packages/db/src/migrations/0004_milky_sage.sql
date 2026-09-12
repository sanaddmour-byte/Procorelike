ALTER TABLE "inspections" ADD COLUMN "signed_by_name" varchar(200);--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "created_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "server_revision" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "conflict_data" jsonb;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;