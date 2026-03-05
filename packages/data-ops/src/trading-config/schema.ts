import { z } from 'zod';

export const ModelSelectionSchema = z
	.string()
	.regex(
		/^(openai|anthropic|google|xai|deepseek)\/[\w-]+$/,
		'Model must be in format provider/model',
	);

export const TradingConfigSchema = z.object({
	maxPositionValue: z.number().int().min(100).max(100000).default(5000),
	maxPositions: z.number().int().min(1).max(50).default(10),
	maxNotionalPerTrade: z.number().int().min(100).max(100000).default(5000),

	maxDailyLossPct: z.number().min(0.001).max(0.1).default(0.02),
	takeProfitPct: z.number().min(0.01).max(1.0).default(0.15),
	stopLossPct: z.number().min(0.01).max(0.5).default(0.08),
	positionSizePctOfCash: z.number().min(0.01).max(1.0).default(0.1),

	cooldownMinutesAfterLoss: z.number().int().min(0).max(1440).default(30),

	researchModel: ModelSelectionSchema.default('openai/gpt-4o-mini'),
	analystModel: ModelSelectionSchema.default('openai/gpt-4o'),

	tradingHoursOnly: z.boolean().default(true),
	extendedHoursAllowed: z.boolean().default(false),
	allowShortSelling: z.boolean().default(false),

	tickerBlacklist: z.array(z.string().toUpperCase()).default([]),
	tickerAllowlist: z.array(z.string().toUpperCase()).nullable().default(null),
});

export type TradingConfig = z.infer<typeof TradingConfigSchema>;

export const UpdateTradingConfigRequestSchema = TradingConfigSchema.partial();
export type UpdateTradingConfigRequest = z.infer<typeof UpdateTradingConfigRequestSchema>;
