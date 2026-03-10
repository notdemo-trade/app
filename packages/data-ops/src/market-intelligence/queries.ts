import { desc, eq } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { insider_trades, institutional_holdings, price_targets } from './table';

export async function getRecentInsiderTrades(
	symbol: string,
	limit = 10,
): Promise<Record<string, unknown>[]> {
	const db = getDb();
	const rows = await db
		.select({ data: insider_trades.data })
		.from(insider_trades)
		.where(eq(insider_trades.symbol, symbol))
		.orderBy(desc(insider_trades.tradeDate))
		.limit(limit);
	return rows.map((r) => r.data as Record<string, unknown>);
}

export async function getTopInstitutionalHoldings(
	symbol: string,
	limit = 10,
): Promise<Record<string, unknown>[]> {
	const db = getDb();
	const rows = await db
		.select({ data: institutional_holdings.data })
		.from(institutional_holdings)
		.where(eq(institutional_holdings.symbol, symbol))
		.orderBy(desc(institutional_holdings.reportDate))
		.limit(limit);
	return rows.map((r) => r.data as Record<string, unknown>);
}

export async function getRecentPriceTargets(
	symbol: string,
	limit = 10,
): Promise<Record<string, unknown>[]> {
	const db = getDb();
	const rows = await db
		.select({ data: price_targets.data })
		.from(price_targets)
		.where(eq(price_targets.symbol, symbol))
		.orderBy(desc(price_targets.publishedDate))
		.limit(limit);
	return rows.map((r) => r.data as Record<string, unknown>);
}

export async function upsertInsiderTrades(
	symbol: string,
	trades: { tradeDate: Date; data: Record<string, unknown> }[],
): Promise<void> {
	if (trades.length === 0) return;
	const db = getDb();
	await db
		.insert(insider_trades)
		.values(trades.map((t) => ({ symbol, tradeDate: t.tradeDate, data: t.data })))
		.onConflictDoNothing();
}

export async function upsertInstitutionalHoldings(
	symbol: string,
	holdings: { reportDate: Date; data: Record<string, unknown> }[],
): Promise<void> {
	if (holdings.length === 0) return;
	const db = getDb();
	await db
		.insert(institutional_holdings)
		.values(holdings.map((h) => ({ symbol, reportDate: h.reportDate, data: h.data })))
		.onConflictDoNothing();
}

export async function upsertPriceTargets(
	symbol: string,
	targets: { publishedDate: Date; data: Record<string, unknown> }[],
): Promise<void> {
	if (targets.length === 0) return;
	const db = getDb();
	await db
		.insert(price_targets)
		.values(targets.map((t) => ({ symbol, publishedDate: t.publishedDate, data: t.data })))
		.onConflictDoNothing();
}
