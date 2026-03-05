import { eq } from 'drizzle-orm';
import { getDb } from '../database/setup';
import type { TradingConfig } from './schema';
import { user_trading_config } from './table';

export async function getTradingConfig(userId: string): Promise<TradingConfig | null> {
	const db = getDb();
	const [row] = await db
		.select()
		.from(user_trading_config)
		.where(eq(user_trading_config.userId, userId))
		.limit(1);

	return (row as TradingConfig | undefined) ?? null;
}

export async function upsertTradingConfig(
	userId: string,
	config: Partial<TradingConfig>,
): Promise<TradingConfig> {
	const db = getDb();
	const [result] = await db
		.insert(user_trading_config)
		.values({ userId, ...config })
		.onConflictDoUpdate({
			target: user_trading_config.userId,
			set: { ...config, updatedAt: new Date() },
		})
		.returning();

	if (!result) throw new Error('Failed to upsert trading config');

	return result as unknown as TradingConfig;
}
