CREATE TYPE "public"."credential_provider" AS ENUM('alpaca', 'openai', 'anthropic', 'google', 'xai', 'deepseek');--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"encrypted_data" text NOT NULL,
	"paper_mode" boolean,
	"iv" text NOT NULL,
	"salt" text NOT NULL,
	"last_validated_at" timestamp,
	"validation_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_credentials_user_provider" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "user_trading_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"max_position_value" integer DEFAULT 5000 NOT NULL,
	"max_positions" integer DEFAULT 10 NOT NULL,
	"max_notional_per_trade" integer DEFAULT 5000 NOT NULL,
	"max_daily_loss_pct" real DEFAULT 0.02 NOT NULL,
	"take_profit_pct" real DEFAULT 0.15 NOT NULL,
	"stop_loss_pct" real DEFAULT 0.08 NOT NULL,
	"position_size_pct_of_cash" real DEFAULT 0.1 NOT NULL,
	"cooldown_minutes_after_loss" integer DEFAULT 30 NOT NULL,
	"research_model" text DEFAULT 'openai/gpt-4o-mini',
	"analyst_model" text DEFAULT 'openai/gpt-4o',
	"trading_hours_only" boolean DEFAULT true NOT NULL,
	"extended_hours_allowed" boolean DEFAULT false NOT NULL,
	"allow_short_selling" boolean DEFAULT false NOT NULL,
	"ticker_blacklist" text[] DEFAULT '{}',
	"ticker_allowlist" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_trading_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trading_config" ADD CONSTRAINT "user_trading_config_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_credentials_user_id" ON "user_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_trading_config_user_id" ON "user_trading_config" USING btree ("user_id");