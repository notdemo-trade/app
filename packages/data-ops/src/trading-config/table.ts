import { boolean, index, integer, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auth_user } from '../drizzle/auth-schema';

export const user_trading_config = pgTable(
	'user_trading_config',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.unique()
			.references(() => auth_user.id, { onDelete: 'cascade' }),

		// Position limits
		maxPositionValue: integer('max_position_value').notNull().default(5000),
		maxPositions: integer('max_positions').notNull().default(10),
		maxNotionalPerTrade: integer('max_notional_per_trade').notNull().default(5000),

		// Risk management
		maxDailyLossPct: real('max_daily_loss_pct').notNull().default(0.02),
		takeProfitPct: real('take_profit_pct').notNull().default(0.15),
		stopLossPct: real('stop_loss_pct').notNull().default(0.08),
		positionSizePctOfCash: real('position_size_pct_of_cash').notNull().default(0.1),

		// Cooldown
		cooldownMinutesAfterLoss: integer('cooldown_minutes_after_loss').notNull().default(30),

		// LLM model selection
		researchModel: text('research_model').default('openai/gpt-4o-mini'),
		analystModel: text('analyst_model').default('openai/gpt-4o'),

		// Feature flags
		tradingHoursOnly: boolean('trading_hours_only').notNull().default(true),
		extendedHoursAllowed: boolean('extended_hours_allowed').notNull().default(false),
		allowShortSelling: boolean('allow_short_selling').notNull().default(false),

		// Symbol restrictions
		tickerBlacklist: text('ticker_blacklist').array().default([]),
		tickerAllowlist: text('ticker_allowlist').array(),

		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index('idx_user_trading_config_user_id').on(table.userId)],
);
