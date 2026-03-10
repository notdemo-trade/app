import { eq } from 'drizzle-orm';
import { getDb } from '../database/setup';
import type { UpsertActiveSymbol } from './schema';
import { active_symbols } from './table';

export async function getActiveSymbols(): Promise<
	{ id: string; symbol: string; name: string | null; assetClass: string }[]
> {
	const db = getDb();
	return db
		.select({
			id: active_symbols.id,
			symbol: active_symbols.symbol,
			name: active_symbols.name,
			assetClass: active_symbols.assetClass,
		})
		.from(active_symbols)
		.where(eq(active_symbols.isActive, true));
}

export async function upsertActiveSymbols(
	symbols: UpsertActiveSymbol[],
): Promise<{ symbol: string }[]> {
	const db = getDb();
	const result = await db
		.insert(active_symbols)
		.values(
			symbols.map((s) => ({
				symbol: s.symbol.toUpperCase(),
				name: s.name ?? null,
				assetClass: s.assetClass,
			})),
		)
		.onConflictDoNothing()
		.returning({ symbol: active_symbols.symbol });
	return result;
}

export async function deactivateSymbol(symbol: string): Promise<boolean> {
	const db = getDb();
	const result = await db
		.update(active_symbols)
		.set({ isActive: false, deactivatedAt: new Date() })
		.where(eq(active_symbols.symbol, symbol.toUpperCase()))
		.returning({ id: active_symbols.id });
	return result.length > 0;
}

export async function listAllSymbols(): Promise<
	{ symbol: string; isActive: boolean; assetClass: string; addedAt: Date }[]
> {
	const db = getDb();
	return db
		.select({
			symbol: active_symbols.symbol,
			isActive: active_symbols.isActive,
			assetClass: active_symbols.assetClass,
			addedAt: active_symbols.addedAt,
		})
		.from(active_symbols);
}
