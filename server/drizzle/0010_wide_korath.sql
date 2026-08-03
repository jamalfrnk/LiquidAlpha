ALTER TABLE "fills" ADD COLUMN "price_source" "market_snapshot_source";--> statement-breakpoint
ALTER TABLE "fills" ADD COLUMN "source_timestamp" timestamp;--> statement-breakpoint
ALTER TABLE "fills" ADD COLUMN "fill_model_version" varchar(16);--> statement-breakpoint
ALTER TABLE "fills" ADD COLUMN "reference_price" numeric;--> statement-breakpoint
ALTER TABLE "fills" ADD COLUMN "slippage_amount" numeric;--> statement-breakpoint
ALTER TABLE "fills" ADD COLUMN "fee_amount" numeric;--> statement-breakpoint
ALTER TABLE "fills" ADD COLUMN "market_type" varchar(10) DEFAULT 'perp' NOT NULL;--> statement-breakpoint
ALTER TABLE "fills" ADD COLUMN "simulated" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "leverage" numeric DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "liquidation_price_estimate" numeric;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "fees_paid" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "funding_paid" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "last_funding_charged_at" timestamp;