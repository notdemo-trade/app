import {
	bigint,
	doublePrecision,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core';

export const market_data_bars = pgTable(
	'market_data_bars',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		symbol: text('symbol').notNull(),
		timeframe: text('timeframe').notNull(),
		timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
		open: doublePrecision('open').notNull(),
		high: doublePrecision('high').notNull(),
		low: doublePrecision('low').notNull(),
		close: doublePrecision('close').notNull(),
		volume: bigint('volume', { mode: 'number' }).notNull(),
		source: text('source').notNull().default('alpha_vantage'),
		fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
	},
	(table) => [
		unique('uq_bars_symbol_tf_ts').on(table.symbol, table.timeframe, table.timestamp),
		index('idx_bars_symbol_tf_ts').on(table.symbol, table.timeframe, table.timestamp),
	],
);
