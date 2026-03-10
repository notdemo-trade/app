import {
	doublePrecision,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core';

export const earnings = pgTable(
	'earnings',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		symbol: text('symbol').notNull(),
		reportDate: timestamp('report_date').notNull(),
		fiscalPeriod: text('fiscal_period').notNull(),
		epsEstimate: doublePrecision('eps_estimate'),
		epsActual: doublePrecision('eps_actual'),
		revenueEstimate: doublePrecision('revenue_estimate'),
		revenueActual: doublePrecision('revenue_actual'),
		surprise: doublePrecision('surprise'),
		surprisePct: doublePrecision('surprise_pct'),
		data: jsonb('data').notNull(),
		fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
	},
	(table) => [
		unique('uq_earnings_symbol_period').on(table.symbol, table.fiscalPeriod),
		index('idx_earnings_symbol').on(table.symbol, table.reportDate),
	],
);
