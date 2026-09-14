CREATE TABLE "submittal_distribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submittal_id" uuid NOT NULL,
	"user_id" uuid,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "punch_item_distribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"punch_item_id" uuid NOT NULL,
	"user_id" uuid,
	"company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submittal_distribution" ADD CONSTRAINT "submittal_distribution_submittal_id_submittals_id_fk" FOREIGN KEY ("submittal_id") REFERENCES "public"."submittals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittal_distribution" ADD CONSTRAINT "submittal_distribution_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submittal_distribution" ADD CONSTRAINT "submittal_distribution_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punch_item_distribution" ADD CONSTRAINT "punch_item_distribution_punch_item_id_punch_items_id_fk" FOREIGN KEY ("punch_item_id") REFERENCES "public"."punch_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punch_item_distribution" ADD CONSTRAINT "punch_item_distribution_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punch_item_distribution" ADD CONSTRAINT "punch_item_distribution_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submittal_distribution_submittal_id_idx" ON "submittal_distribution" USING btree ("submittal_id");--> statement-breakpoint
CREATE INDEX "punch_item_distribution_punch_item_id_idx" ON "punch_item_distribution" USING btree ("punch_item_id");