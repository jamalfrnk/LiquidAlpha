CREATE TYPE "public"."user_kind" AS ENUM('wallet', 'guest');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kind" "user_kind" DEFAULT 'wallet' NOT NULL;