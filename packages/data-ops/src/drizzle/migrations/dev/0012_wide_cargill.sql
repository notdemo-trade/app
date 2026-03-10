CREATE TABLE "active_symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"asset_class" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"deactivated_at" timestamp,
	CONSTRAINT "active_symbols_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"report_date" timestamp NOT NULL,
	"fiscal_period" text NOT NULL,
	"eps_estimate" double precision,
	"eps_actual" double precision,
	"revenue_estimate" double precision,
	"revenue_actual" double precision,
	"surprise" double precision,
	"surprise_pct" double precision,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_earnings_symbol_period" UNIQUE("symbol","fiscal_period")
);
--> statement-breakpoint
CREATE TABLE "financial_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"statement_type" text NOT NULL,
	"period" text NOT NULL,
	"filing_date" timestamp,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_fin_stmt_symbol_type_period" UNIQUE("symbol","statement_type","period")
);
--> statement-breakpoint
CREATE TABLE "insider_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"trade_date" timestamp NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutional_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"report_date" timestamp NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_data_bars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" bigint NOT NULL,
	"source" text DEFAULT 'alpha_vantage' NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_bars_symbol_tf_ts" UNIQUE("symbol","timeframe","timestamp")
);
--> statement-breakpoint
CREATE TABLE "price_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"published_date" timestamp NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_earnings_symbol" ON "earnings" USING btree ("symbol","report_date");--> statement-breakpoint
CREATE INDEX "idx_insider_trades_symbol" ON "insider_trades" USING btree ("symbol","trade_date");--> statement-breakpoint
CREATE INDEX "idx_inst_holdings_symbol" ON "institutional_holdings" USING btree ("symbol","report_date");--> statement-breakpoint
CREATE INDEX "idx_bars_symbol_tf_ts" ON "market_data_bars" USING btree ("symbol","timeframe","timestamp");--> statement-breakpoint
CREATE INDEX "idx_price_targets_symbol" ON "price_targets" USING btree ("symbol","published_date");