import { jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const financial_statements = pgTable(
	'financial_statements',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		symbol: text('symbol').notNull(),
		statementType: text('statement_type').notNull(),
		period: text('period').notNull(),
		filingDate: timestamp('filing_date'),
		data: jsonb('data').notNull(),
		fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
	},
	(table) => [
		unique('uq_fin_stmt_symbol_type_period').on(table.symbol, table.statementType, table.period),
	],
);
