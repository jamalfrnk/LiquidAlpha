CREATE TYPE "public"."market_snapshot_source" AS ENUM('hyperliquid', 'coingecko');--> statement-breakpoint
CREATE TABLE "candles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue" varchar(20) DEFAULT 'hyperliquid' NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"market_type" varchar(10) DEFAULT 'perp' NOT NULL,
	"interval" varchar(5) NOT NULL,
	"open_time" timestamp NOT NULL,
	"close_time" timestamp NOT NULL,
	"source_timestamp" timestamp NOT NULL,
	"received_at" timestamp NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume" numeric NOT NULL,
	"closed" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "source" "market_snapshot_source" DEFAULT 'hyperliquid' NOT NULL;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "sz_decimals" integer;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "max_leverage" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "candles_symbol_interval_open_time_idx" ON "candles" USING btree ("symbol","interval","open_time");