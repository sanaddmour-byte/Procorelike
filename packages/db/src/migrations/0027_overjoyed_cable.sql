ALTER TYPE "public"."punch_item_status" ADD VALUE 'not_accepted' BEFORE 'approved';--> statement-breakpoint
ALTER TYPE "public"."punch_item_status" ADD VALUE 'in_dispute' BEFORE 'approved';--> statement-breakpoint
ALTER TABLE "punch_items" ADD COLUMN "final_approver_user_id" uuid;--> statement-breakpoint
ALTER TABLE "punch_items" ADD CONSTRAINT "punch_items_final_approver_user_id_users_id_fk" FOREIGN KEY ("final_approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;