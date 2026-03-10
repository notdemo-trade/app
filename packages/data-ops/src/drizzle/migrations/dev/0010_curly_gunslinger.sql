ALTER TYPE "public"."credential_provider" ADD VALUE 'telegram';--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enable_trade_proposals" boolean DEFAULT true NOT NULL,
	"enable_trade_results" boolean DEFAULT true NOT NULL,
	"enable_daily_summary" boolean DEFAULT true NOT NULL,
	"enable_risk_alerts" boolean DEFAULT true NOT NULL,
	"daily_summary_time" text DEFAULT '17:00' NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;