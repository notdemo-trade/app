ALTER TABLE "user_trading_config" ADD COLUMN "proposal_timeout_sec" integer DEFAULT 900 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_trading_config" ADD COLUMN "llm_temperature" real DEFAULT 0.3 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_trading_config" ADD COLUMN "llm_max_tokens" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_trading_config" ADD COLUMN "score_windows" jsonb DEFAULT '[30,90,180]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_trading_config" ADD COLUMN "confidence_display_high" real DEFAULT 0.7 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_trading_config" ADD COLUMN "confidence_display_med" real DEFAULT 0.4 NOT NULL;