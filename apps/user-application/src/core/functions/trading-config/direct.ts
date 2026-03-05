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
		return upsertTradingConfig(context.userId, data);
	});
