import { and, desc, eq, sql } from 'drizzle-orm';
import type { Bar } from '../agents/ta/types';
import { getDb } from '../database/setup';
import type { UpsertBar } from './schema';
import { market_data_bars } from './table';

export async function getBarsForSymbol(
	symbol: string,
	timeframe: string,
	limit = 250,
): Promise<Bar[]> {
	const db = getDb();
	const rows = await db
		.select({
			timestamp: market_data_bars.timestamp,
			open: market_data_bars.open,
			high: market_data_bars.high,
			low: market_data_bars.low,
			close: market_data_bars.close,
			volume: market_data_bars.volume,
		})
		.from(market_data_bars)
		.where(and(eq(market_data_bars.symbol, symbol), eq(market_data_bars.timeframe, timeframe)))
		.orderBy(desc(market_data_bars.timestamp))
		.limit(limit);

	return rows.map((row) => ({
		t: row.timestamp.toISOString(),
		o: row.open,
		h: row.high,
		l: row.low,
		c: row.close,
		v: row.volume,
		n: 0,
		vw: 0,
	}));
}

// 9 params per row, Postgres limit is 65535 → safe batch size ~500
const UPSERT_BATCH_SIZE = 500;

export async function upsertBars(bars: UpsertBar[]): Promise<number> {
	if (bars.length === 0) return 0;
	const db = getDb();

	let total = 0;
	for (let i = 0; i < bars.length; i += UPSERT_BATCH_SIZE) {
		const batch = bars.slice(i, i + UPSERT_BATCH_SIZE);
		const result = await db
			.insert(market_data_bars)
			.values(
				batch.map((b) => ({
					symbol: b.symbol,
					timeframe: b.timeframe,
					timestamp: b.timestamp,
					open: b.open,
					high: b.high,
					low: b.low,
					close: b.close,
					volume: b.volume,
					source: b.source,
				})),
			)
			.onConflictDoUpdate({
				target: [market_data_bars.symbol, market_data_bars.timeframe, market_data_bars.timestamp],
				set: {
					open: sql`excluded.open`,
					high: sql`excluded.high`,
					low: sql`excluded.low`,
					close: sql`excluded.close`,
					volume: sql`excluded.volume`,
					source: sql`excluded.source`,
					fetchedAt: sql`now()`,
				},
			})
			.returning({ id: market_data_bars.id });
		total += result.length;
	}

	return total;
}

export async function getLatestBarTimestamp(
	symbol: string,
	timeframe: string,
): Promise<Date | null> {
	const db = getDb();
	const rows = await db
		.select({ timestamp: market_data_bars.timestamp })
		.from(market_data_bars)
		.where(and(eq(market_data_bars.symbol, symbol), eq(market_data_bars.timeframe, timeframe)))
		.orderBy(desc(market_data_bars.timestamp))
		.limit(1);

	return rows[0]?.timestamp ?? null;
}
