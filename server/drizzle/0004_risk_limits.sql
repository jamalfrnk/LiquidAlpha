CREATE TABLE "risk_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"max_position_size" numeric NOT NULL,
	"max_leverage" numeric NOT NULL,
	"max_open_positions" integer NOT NULL,
	"max_daily_loss_percent" numeric NOT NULL,
	"kill_switch_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risk_limits_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "risk_limits" ADD CONSTRAINT "risk_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;