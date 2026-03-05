CREATE TABLE "llm_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"action" text NOT NULL,
	"confidence" real NOT NULL,
	"rationale" text NOT NULL,
	"entry_price" real,
	"target_price" real,
	"stop_loss" real,
	"position_size_pct" real,
	"timeframe" text,
	"risks" jsonb,
	"research" text,
	"technicals" jsonb,
	"signals" jsonb,
	"strategy_id" text,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"estimated_cost_usd" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" real DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "llm_usage_user_date_provider_uq" UNIQUE("user_id","date","provider")
);
--> statement-breakpoint
ALTER TABLE "llm_analyses" ADD CONSTRAINT "llm_analyses_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_analyses_user_id_idx" ON "llm_analyses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "llm_analyses_symbol_idx" ON "llm_analyses" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "llm_analyses_created_at_idx" ON "llm_analyses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "llm_usage_user_date_provider_idx" ON "llm_usage" USING btree ("user_id","date","provider");