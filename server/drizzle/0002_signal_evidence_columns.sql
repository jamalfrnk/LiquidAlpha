ALTER TABLE "signals" ADD COLUMN "rule_alignment_score" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "rule_version" varchar(16) NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "explanation" text NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "entry_price" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "stop_loss" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "take_profit" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "risk_reward_ratio" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "indicator_snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "data_from" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "data_to" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "bar_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "data_quality" varchar(16) NOT NULL;