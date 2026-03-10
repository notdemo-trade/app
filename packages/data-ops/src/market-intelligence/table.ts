import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const insider_trades = pgTable(
	'insider_trades',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		symbol: text('symbol').notNull(),
		tradeDate: timestamp('trade_date').notNull(),
		data: jsonb('data').notNull(),
		fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
	},
	(table) => [index('idx_insider_trades_symbol').on(table.symbol, table.tradeDate)],
);

export const institutional_holdings = pgTable(
	'institutional_holdings',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		symbol: text('symbol').notNull(),
		reportDate: timestamp('report_date').notNull(),
		data: jsonb('data').notNull(),
		fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
	},
	(table) => [index('idx_inst_holdings_symbol').on(table.symbol, table.reportDate)],
);
