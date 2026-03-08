import {
	DEFAULT_TA_CONFIG,
	deleteTaConfig,
	getTaConfig,
	PRESET_CONFIGS,
	PresetNameSchema,
	type TechnicalAnalysisConfig,
	TechnicalAnalysisConfigSchema,
	upsertTaConfig,
} from '@repo/data-ops/ta-config';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';

export const getUserTaConfig = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }): Promise<TechnicalAnalysisConfig> => {
		return getTaConfig(context.userId);
	});

export const updateUserTaConfig = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(TechnicalAnalysisConfigSchema)
	.handler(async ({ context, data }) => {
		return upsertTaConfig(context.userId, data);
	});

export const applyTaPreset = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ presetName: PresetNameSchema }))
	.handler(async ({ context, data }) => {
		const preset = PRESET_CONFIGS[data.presetName];
		if (!preset) throw new Error(`Unknown preset: ${data.presetName}`);
		return upsertTaConfig(context.userId, preset);
	});

export const resetUserTaConfig = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		await deleteTaConfig(context.userId);
		return { ...DEFAULT_TA_CONFIG };
	});
