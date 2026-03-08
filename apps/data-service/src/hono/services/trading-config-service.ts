import type { TradingConfig } from '@repo/data-ops/trading-config';
import {
	getTradingConfig,
	TradingConfigSchema,
	upsertTradingConfig,
} from '@repo/data-ops/trading-config';
import type { Result } from '../types/result';
import { AppError, err, ok } from '../types/result';

export async function getUserTradingConfig(userId: string): Promise<Result<TradingConfig>> {
	const config = await getTradingConfig(userId);
	return ok(TradingConfigSchema.parse(config ?? {}));
}

export async function updateUserTradingConfig(
	userId: string,
	updates: Partial<TradingConfig>,
): Promise<Result<TradingConfig>> {
	// Cross-field validation for confidence thresholds
	if (updates.confidenceDisplayHigh !== undefined || updates.confidenceDisplayMed !== undefined) {
		const existing = await getTradingConfig(userId);
		const mergedHigh = updates.confidenceDisplayHigh ?? existing?.confidenceDisplayHigh ?? 0.7;
		const mergedMed = updates.confidenceDisplayMed ?? existing?.confidenceDisplayMed ?? 0.4;
		if (mergedHigh <= mergedMed) {
			return err(
				new AppError(
					'High confidence threshold must be greater than medium threshold',
					400,
					'VALIDATION_ERROR',
				),
			);
		}
	}

	const config = await upsertTradingConfig(userId, updates);
	return ok(config);
}
