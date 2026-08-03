CREATE TYPE "public"."backtest_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "backtest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "backtest_status" DEFAULT 'PENDING' NOT NULL,
	"config" jsonb NOT NULL,
	"engine_version" varchar(16) NOT NULL,
	"summary" jsonb,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "backtest_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"side" "order_side" NOT NULL,
	"signal_strength_score" numeric,
	"rule_alignment_score" numeric NOT NULL,
	"entry_time" timestamp NOT NULL,
	"entry_price" numeric NOT NULL,
	"exit_time" timestamp NOT NULL,
	"exit_price" numeric NOT NULL,
	"exit_reason" varchar(16) NOT NULL,
	"holding_candles" integer NOT NULL,
	"fees_paid" numeric NOT NULL,
	"funding_paid" numeric NOT NULL,
	"pnl" numeric NOT NULL,
	"return_pct" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backtest_runs" ADD CONSTRAINT "backtest_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_run_id_backtest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."backtest_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backtest_runs_user_id_idx" ON "backtest_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "backtest_trades_run_id_idx" ON "backtest_trades" USING btree ("run_id");