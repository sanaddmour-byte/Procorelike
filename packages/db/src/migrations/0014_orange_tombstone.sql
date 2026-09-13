ALTER TABLE "schedule_tasks" RENAME TO "manual_schedule_tasks";--> statement-breakpoint
ALTER TABLE "manual_schedule_tasks" DROP CONSTRAINT "schedule_tasks_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "manual_schedule_tasks" DROP CONSTRAINT "schedule_tasks_assigned_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "manual_schedule_tasks" DROP CONSTRAINT "schedule_tasks_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "manual_schedule_tasks" DROP CONSTRAINT "schedule_tasks_updated_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "schedule_tasks_project_id_idx";--> statement-breakpoint
ALTER TABLE "manual_schedule_tasks" ADD CONSTRAINT "manual_schedule_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_schedule_tasks" ADD CONSTRAINT "manual_schedule_tasks_assigned_company_id_companies_id_fk" FOREIGN KEY ("assigned_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_schedule_tasks" ADD CONSTRAINT "manual_schedule_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_schedule_tasks" ADD CONSTRAINT "manual_schedule_tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_schedule_tasks_project_id_idx" ON "manual_schedule_tasks" USING btree ("project_id");