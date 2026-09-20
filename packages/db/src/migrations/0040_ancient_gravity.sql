CREATE TABLE "action_plan_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"description" text NOT NULL,
	"default_due_days" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_plan_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_revision" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"template_id" uuid,
	"name" varchar(200) NOT NULL,
	"source_type" "corrective_action_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD COLUMN "action_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "action_plan_template_items" ADD CONSTRAINT "action_plan_template_items_template_id_action_plan_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."action_plan_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plan_templates" ADD CONSTRAINT "action_plan_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plan_templates" ADD CONSTRAINT "action_plan_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_template_id_action_plan_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."action_plan_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_plan_template_items_template_id_idx" ON "action_plan_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "action_plan_templates_project_id_idx" ON "action_plan_templates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "action_plans_project_id_idx" ON "action_plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "action_plans_source_idx" ON "action_plans" USING btree ("source_type","source_id");--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_action_plan_id_action_plans_id_fk" FOREIGN KEY ("action_plan_id") REFERENCES "public"."action_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corrective_actions_action_plan_id_idx" ON "corrective_actions" USING btree ("action_plan_id");