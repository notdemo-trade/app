import { z } from 'zod';

export const ModelSelectionSchema = z
	.string()
	.regex(
		/^(openai|anthropic|google|xai|deepseek|workers-ai)\/[\w@/.:-]+$/,
		'Model must be in format provider/model',
	);

export const ScoreWindowsSchema = z
	.array(z.number().int().min(7).max(365))
	.min(1)
	.max(5)
	.refine(
		(arr) => {
			const sorted = [...arr].sort((a, b) => a - b);
			return arr.every((v, i) => v === sorted[i]);
		},
		{ message: 'Score windows must be sorted ascending' },
	)
	.refine((arr) => new Set(arr).size === arr.length, {
		message: 'Score windows must be unique',
	})
	.default([30, 90, 180]);

const TradingConfigBaseSchema = z.object({
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

	// Phase 23: Extended settings
	proposalTimeoutSec: z.number().int().min(60).max(3600).default(900),
	llmTemperature: z.number().min(0).max(1).default(0.3),
	llmMaxTokens: z.number().int().min(200).max(4000).default(1000),
	scoreWindows: ScoreWindowsSchema,
	confidenceDisplayHigh: z.number().min(0.5).max(1.0).default(0.7),
	confidenceDisplayMed: z.number().min(0.1).max(0.7).default(0.4),

	// Phase 24: Customizable moderator prompt
	moderatorPrompt: z.string().min(10).max(2000).nullable().default(null),
});

export const TradingConfigSchema = TradingConfigBaseSchema.refine(
	(data) => data.confidenceDisplayHigh > data.confidenceDisplayMed,
	{
		message: 'High confidence threshold must be greater than medium threshold',
		path: ['confidenceDisplayHigh'],
	},
);

export type TradingConfig = z.infer<typeof TradingConfigSchema>;

export const UpdateTradingConfigRequestSchema = TradingConfigBaseSchema.partial();
export type UpdateTradingConfigRequest = z.infer<typeof UpdateTradingConfigRequestSchema>;
