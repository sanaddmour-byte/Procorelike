ALTER TYPE "public"."submittal_status" ADD VALUE 'approved_as_noted' BEFORE 'closed';--> statement-breakpoint
ALTER TYPE "public"."submittal_status" ADD VALUE 'revise_resubmit' BEFORE 'closed';--> statement-breakpoint
ALTER TYPE "public"."submittal_status" ADD VALUE 'rejected' BEFORE 'closed';