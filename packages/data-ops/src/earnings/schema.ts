import { z } from 'zod';

export const EarningsSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string(),
	reportDate: z.date(),
	fiscalPeriod: z.string(),
	epsEstimate: z.number().nullable(),
	epsActual: z.number().nullable(),
	revenueEstimate: z.number().nullable(),
	revenueActual: z.number().nullable(),
	surprise: z.number().nullable(),
	surprisePct: z.number().nullable(),
	data: z.record(z.string(), z.unknown()),
	fetchedAt: z.date(),
});

export type Earnings = z.infer<typeof EarningsSchema>;
