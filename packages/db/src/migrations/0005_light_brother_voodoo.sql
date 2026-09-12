ALTER TABLE "projects" ADD COLUMN "change_order_threshold" numeric(14, 2) DEFAULT '5000' NOT NULL;--> statement-breakpoint
ALTER TABLE "commitment_line_items" ADD COLUMN "description" varchar(300) NOT NULL;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "number" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "title" varchar(300) NOT NULL;