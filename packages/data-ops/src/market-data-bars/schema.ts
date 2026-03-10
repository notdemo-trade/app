import { z } from 'zod';

export const MarketDataBarSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string(),
	timeframe: z.string(),
	timestamp: z.date(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	source: z.string(),
	fetchedAt: z.date(),
});

export const UpsertBarSchema = z.object({
	symbol: z.string(),
	timeframe: z.string(),
	timestamp: z.date(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	source: z.string().default('alpha_vantage'),
});

export type MarketDataBar = z.infer<typeof MarketDataBarSchema>;
export type UpsertBar = z.infer<typeof UpsertBarSchema>;
