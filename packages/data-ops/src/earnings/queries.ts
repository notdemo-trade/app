import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { earnings } from './table';

export async function getLatestEarnings(symbol: string): Promise<{
	fiscalPeriod: string;
	epsActual: number | null;
	epsEstimate: number | null;
	surprisePct: number | null;
	reportDate: Date;
} | null> {
	const db = getDb();
	const rows = await db
		.select({
			fiscalPeriod: earnings.fiscalPeriod,
			epsActual: earnings.epsActual,
			epsEstimate: earnings.epsEstimate,
			surprisePct: earnings.surprisePct,
			reportDate: earnings.reportDate,
		})
		.from(earnings)
		.where(eq(earnings.symbol, symbol))
		.orderBy(desc(earnings.reportDate))
		.limit(1);

	return rows[0] ?? null;
}

export async function getUpcomingEarnings(symbol: string): Promise<{
	reportDate: Date;
	fiscalPeriod: string;
	epsEstimate: number | null;
	revenueEstimate: number | null;
} | null> {
	const db = getDb();
	const now = new Date();
	const rows = await db
		.select({
			reportDate: earnings.reportDate,
			fiscalPeriod: earnings.fiscalPeriod,
			epsEstimate: earnings.epsEstimate,
			revenueEstimate: earnings.revenueEstimate,
		})
		.from(earnings)
		.where(eq(earnings.symbol, symbol))
		.orderBy(desc(earnings.reportDate))
		.limit(5);

	// Find the first upcoming (future) earnings
	const upcoming = rows.find((r) => r.reportDate > now);
	return upcoming ?? null;
}

export async function upsertEarnings(params: {
	symbol: string;
	reportDate: Date;
	fiscalPeriod: string;
	epsEstimate?: number;
	epsActual?: number;
	revenueEstimate?: number;
	revenueActual?: number;
	surprise?: number;
	surprisePct?: number;
	data: Record<string, unknown>;
}): Promise<void> {
	const db = getDb();
	await db
		.insert(earnings)
		.values({
			symbol: params.symbol,
			reportDate: params.reportDate,
			fiscalPeriod: params.fiscalPeriod,
			epsEstimate: params.epsEstimate ?? null,
			epsActual: params.epsActual ?? null,
			revenueEstimate: params.revenueEstimate ?? null,
			revenueActual: params.revenueActual ?? null,
			surprise: params.surprise ?? null,
			surprisePct: params.surprisePct ?? null,
			data: params.data,
		})
		.onConflictDoUpdate({
			target: [earnings.symbol, earnings.fiscalPeriod],
			set: {
				epsEstimate: sql`excluded.eps_estimate`,
				epsActual: sql`excluded.eps_actual`,
				revenueEstimate: sql`excluded.revenue_estimate`,
				revenueActual: sql`excluded.revenue_actual`,
				surprise: sql`excluded.surprise`,
				surprisePct: sql`excluded.surprise_pct`,
				data: sql`excluded.data`,
				fetchedAt: sql`now()`,
			},
		});
}
