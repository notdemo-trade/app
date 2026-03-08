import { integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const technicalAnalysisConfig = pgTable('technical_analysis_config', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id').notNull().unique(),
	profileName: text('profile_name').notNull().default('default'),

	// Indicator periods
	smaPeriods: jsonb('sma_periods').$type<number[]>().notNull().default([20, 50, 200]),
	emaPeriods: jsonb('ema_periods').$type<number[]>().notNull().default([12, 26]),
	rsiPeriod: integer('rsi_period').notNull().default(14),
	bollingerPeriod: integer('bollinger_period').notNull().default(20),
	bollingerStdDev: real('bollinger_std_dev').notNull().default(2.0),
	atrPeriod: integer('atr_period').notNull().default(14),
	volumeSmaPeriod: integer('volume_sma_period').notNull().default(20),
	macdSignalPeriod: integer('macd_signal_period').notNull().default(9),

	// Signal thresholds
	rsiOversold: integer('rsi_oversold').notNull().default(30),
	rsiOverbought: integer('rsi_overbought').notNull().default(70),
	volumeSpikeMultiplier: real('volume_spike_multiplier').notNull().default(2.0),

	// Analysis settings
	minBarsRequired: integer('min_bars_required').notNull().default(50),
	defaultBarsToFetch: integer('default_bars_to_fetch').notNull().default(250),
	cacheFreshnessSec: integer('cache_freshness_sec').notNull().default(60),

	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
