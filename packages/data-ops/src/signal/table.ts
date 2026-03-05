import { decimal, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const signals = pgTable(
	'signals',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sourceAgent: text('source_agent').notNull(),
		symbol: text('symbol'),
		seriesId: text('series_id'),
		signalType: text('signal_type').notNull(),
		direction: text('direction').notNull(),
		strength: decimal('strength', { precision: 3, scale: 2 }).notNull(),
		summary: text('summary'),
		metadata: jsonb('metadata'),
		rawEventId: uuid('raw_event_id'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [
		index('idx_signals_source').on(table.sourceAgent),
		index('idx_signals_symbol').on(table.symbol),
		index('idx_signals_created').on(table.createdAt),
		index('idx_signals_symbol_created').on(table.symbol, table.createdAt),
	],
);
