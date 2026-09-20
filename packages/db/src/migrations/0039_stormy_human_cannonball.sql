CREATE TABLE "workflow_transition_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"module" "permission_module" NOT NULL,
	"from_status" varchar(100) NOT NULL,
	"to_status" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"required_level" "permission_level" DEFAULT 'standard' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_transition_rules" ADD CONSTRAINT "workflow_transition_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_transition_rules_project_module_from_to_idx" ON "workflow_transition_rules" USING btree ("project_id","module","from_status","to_status");