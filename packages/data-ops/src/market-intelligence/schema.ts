import { z } from 'zod';

export const InsiderTradeSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string(),
	tradeDate: z.date(),
	data: z.record(z.string(), z.unknown()),
	fetchedAt: z.date(),
});

export const InstitutionalHoldingSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string(),
	reportDate: z.date(),
	data: z.record(z.string(), z.unknown()),
	fetchedAt: z.date(),
});

export type InsiderTrade = z.infer<typeof InsiderTradeSchema>;
export type InstitutionalHolding = z.infer<typeof InstitutionalHoldingSchema>;
