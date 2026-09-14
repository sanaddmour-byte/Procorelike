CREATE TABLE "budget_modifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_line_item_id" uuid NOT NULL,
	"to_line_item_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD COLUMN "modifications_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_modifications" ADD CONSTRAINT "budget_modifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_modifications" ADD CONSTRAINT "budget_modifications_from_line_item_id_budget_line_items_id_fk" FOREIGN KEY ("from_line_item_id") REFERENCES "public"."budget_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_modifications" ADD CONSTRAINT "budget_modifications_to_line_item_id_budget_line_items_id_fk" FOREIGN KEY ("to_line_item_id") REFERENCES "public"."budget_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_modifications" ADD CONSTRAINT "budget_modifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_modifications_project_id_idx" ON "budget_modifications" USING btree ("project_id");