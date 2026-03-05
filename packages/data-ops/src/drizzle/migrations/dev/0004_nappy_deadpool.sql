CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_agent" text NOT NULL,
	"symbol" text,
	"series_id" text,
	"signal_type" text NOT NULL,
	"direction" text NOT NULL,
	"strength" numeric(3, 2) NOT NULL,
	"summary" text,
	"metadata" jsonb,
	"raw_event_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_signals_source" ON "signals" USING btree ("source_agent");--> statement-breakpoint
CREATE INDEX "idx_signals_symbol" ON "signals" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "idx_signals_created" ON "signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_signals_symbol_created" ON "signals" USING btree ("symbol","created_at");