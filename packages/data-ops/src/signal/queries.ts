import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { signals } from './table';

interface InsertSignalInput {
	sourceAgent: string;
	symbol: string;
	signalType: string;
	direction: string;
	strength: number;
	summary: string;
	metadata?: Record<string, unknown>;
}

export async function insertSignal(input: InsertSignalInput) {
	const db = getDb();
	const [row] = await db
		.insert(signals)
		.values({
			sourceAgent: input.sourceAgent,
			symbol: input.symbol,
			signalType: input.signalType,
			direction: input.direction,
			strength: input.strength.toFixed(2),
			summary: input.summary,
			metadata: input.metadata ?? null,
		})
		.returning();
	return row;
}

export async function getSignalsBySymbol(symbol: string, limit = 50) {
	const db = getDb();
	return db
		.select()
		.from(signals)
		.where(eq(signals.symbol, symbol))
		.orderBy(desc(signals.createdAt))
		.limit(limit);
}

export async function getSignalsSince(since: Date, symbol?: string) {
	const db = getDb();
	const conditions = [gte(signals.createdAt, since)];
	if (symbol) conditions.push(eq(signals.symbol, symbol));
	return db
		.select()
		.from(signals)
		.where(and(...conditions))
		.orderBy(desc(signals.createdAt));
}
