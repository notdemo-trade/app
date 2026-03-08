import type { TradingConfig } from '@repo/data-ops/trading-config';
import {
	getTradingConfig,
	TradingConfigSchema,
	UpdateTradingConfigRequestSchema,
	upsertTradingConfig,
} from '@repo/data-ops/trading-config';
import { createServerFn } from '@tanstack/react-start';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';

export const getUserTradingConfig = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }): Promise<TradingConfig> => {
		const config = await getTradingConfig(context.userId);
		return TradingConfigSchema.parse(config ?? {});
	});

export const updateUserTradingConfig = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(UpdateTradingConfigRequestSchema)
	.handler(async ({ data, context }) => {
		// Cross-field validation for confidence thresholds
		if (data.confidenceDisplayHigh !== undefined || data.confidenceDisplayMed !== undefined) {
			const existing = await getTradingConfig(context.userId);
			const mergedHigh = data.confidenceDisplayHigh ?? existing?.confidenceDisplayHigh ?? 0.7;
			const mergedMed = data.confidenceDisplayMed ?? existing?.confidenceDisplayMed ?? 0.4;
			if (mergedHigh <= mergedMed) {
				throw new Error('High confidence threshold must be greater than medium threshold');
			}
		}
		return upsertTradingConfig(context.userId, data);
	});
