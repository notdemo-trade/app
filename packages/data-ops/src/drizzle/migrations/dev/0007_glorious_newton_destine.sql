CREATE TABLE "technical_analysis_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"profile_name" text DEFAULT 'default' NOT NULL,
	"sma_periods" jsonb DEFAULT '[20,50,200]'::jsonb NOT NULL,
	"ema_periods" jsonb DEFAULT '[12,26]'::jsonb NOT NULL,
	"rsi_period" integer DEFAULT 14 NOT NULL,
	"bollinger_period" integer DEFAULT 20 NOT NULL,
	"bollinger_std_dev" real DEFAULT 2 NOT NULL,
	"atr_period" integer DEFAULT 14 NOT NULL,
	"volume_sma_period" integer DEFAULT 20 NOT NULL,
	"macd_signal_period" integer DEFAULT 9 NOT NULL,
	"rsi_oversold" integer DEFAULT 30 NOT NULL,
	"rsi_overbought" integer DEFAULT 70 NOT NULL,
	"volume_spike_multiplier" real DEFAULT 2 NOT NULL,
	"min_bars_required" integer DEFAULT 50 NOT NULL,
	"default_bars_to_fetch" integer DEFAULT 250 NOT NULL,
	"cache_freshness_sec" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "technical_analysis_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "agent_activity_log" DROP CONSTRAINT "agent_activity_log_user_id_auth_user_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_configs" DROP CONSTRAINT "agent_configs_user_id_auth_user_id_fk";
