CREATE TYPE "public"."persona_bias" AS ENUM('bullish', 'bearish', 'neutral');--> statement-breakpoint
CREATE TABLE "debate_personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"system_prompt" text NOT NULL,
	"role" text NOT NULL,
	"bias" "persona_bias" DEFAULT 'neutral' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_trading_config" ADD COLUMN "moderator_prompt" text;--> statement-breakpoint
ALTER TABLE "debate_personas" ADD CONSTRAINT "debate_personas_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_debate_personas_user_id" ON "debate_personas" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_debate_personas_user_name" ON "debate_personas" USING btree ("user_id","name");