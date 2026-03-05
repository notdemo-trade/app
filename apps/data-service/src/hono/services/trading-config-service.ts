import type { TradingConfig } from '@repo/data-ops/trading-config';
import {
	getTradingConfig,
	TradingConfigSchema,
	upsertTradingConfig,
} from '@repo/data-ops/trading-config';
import type { Result } from '../types/result';
import { ok } from '../types/result';

export async function getUserTradingConfig(userId: string): Promise<Result<TradingConfig>> {
	const config = await getTradingConfig(userId);
	return ok(TradingConfigSchema.parse(config ?? {}));
}

export async function updateUserTradingConfig(
	userId: string,
	updates: Partial<TradingConfig>,
): Promise<Result<TradingConfig>> {
	const config = await upsertTradingConfig(userId, updates);
	return ok(config);
}
