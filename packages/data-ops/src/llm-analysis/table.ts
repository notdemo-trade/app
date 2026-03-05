import {
	index,
	integer,
	jsonb,
	pgTable,
	real,
	text,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core';
import { auth_user } from '../drizzle/auth-schema';

export const llm_analyses = pgTable(
	'llm_analyses',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => auth_user.id, { onDelete: 'cascade' }),
		symbol: text('symbol').notNull(),
		action: text('action').notNull(),
		confidence: real('confidence').notNull(),
		rationale: text('rationale').notNull(),
		entryPrice: real('entry_price'),
		targetPrice: real('target_price'),
		stopLoss: real('stop_loss'),
		positionSizePct: real('position_size_pct'),
		timeframe: text('timeframe'),
		risks: jsonb('risks').$type<string[]>(),
		research: text('research'),
		technicals: jsonb('technicals').$type<Record<string, unknown>>(),
		signals: jsonb('signals').$type<Array<{ type: string; direction: string; strength: number }>>(),
		strategyId: text('strategy_id'),
		model: text('model').notNull(),
		provider: text('provider').notNull(),
		promptTokens: integer('prompt_tokens').notNull(),
		completionTokens: integer('completion_tokens').notNull(),
		totalTokens: integer('total_tokens').notNull(),
		estimatedCostUsd: real('estimated_cost_usd').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	(table) => [
		index('llm_analyses_user_id_idx').on(table.userId),
		index('llm_analyses_symbol_idx').on(table.symbol),
		index('llm_analyses_created_at_idx').on(table.createdAt),
	],
);

export const llm_usage = pgTable(
	'llm_usage',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => auth_user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		provider: text('provider').notNull(),
		model: text('model').notNull(),
		promptTokens: integer('prompt_tokens').notNull().default(0),
		completionTokens: integer('completion_tokens').notNull().default(0),
		totalTokens: integer('total_tokens').notNull().default(0),
		estimatedCostUsd: real('estimated_cost_usd').notNull().default(0),
		requestCount: integer('request_count').notNull().default(0),
	},
	(table) => [
		unique('llm_usage_user_date_provider_uq').on(table.userId, table.date, table.provider),
		index('llm_usage_user_date_provider_idx').on(table.userId, table.date, table.provider),
	],
);
