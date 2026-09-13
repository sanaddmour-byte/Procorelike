ALTER TABLE "companies" ADD COLUMN "logo_data_base64" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_mime" varchar(100);--> statement-breakpoint
ALTER TABLE "correspondence" ADD COLUMN "sender_signature_name" varchar(200);