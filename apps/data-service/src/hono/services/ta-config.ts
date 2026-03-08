import {
	DEFAULT_TA_CONFIG,
	deleteTaConfig,
	getTaConfig,
	PRESET_CONFIGS,
	type PresetName,
	type TechnicalAnalysisConfig,
	upsertTaConfig,
} from '@repo/data-ops/ta-config';
import { AppError, err, ok, type Result } from '../types/result';

export async function getTaConfigService(userId: string): Promise<Result<TechnicalAnalysisConfig>> {
	try {
		const config = await getTaConfig(userId);
		return ok(config);
	} catch {
		return err(new AppError('Failed to fetch technical analysis config', 500, 'INTERNAL_ERROR'));
	}
}

export async function updateTaConfigService(
	userId: string,
	config: TechnicalAnalysisConfig,
): Promise<Result<TechnicalAnalysisConfig>> {
	try {
		const updated = await upsertTaConfig(userId, config);
		return ok(updated);
	} catch {
		return err(new AppError('Failed to update technical analysis config', 500, 'INTERNAL_ERROR'));
	}
}

export async function applyPresetService(
	userId: string,
	presetName: PresetName,
): Promise<Result<TechnicalAnalysisConfig>> {
	const preset = PRESET_CONFIGS[presetName];
	if (!preset) {
		return err(new AppError(`Unknown preset: ${presetName}`, 400, 'INVALID_PRESET'));
	}

	try {
		const updated = await upsertTaConfig(userId, preset);
		return ok(updated);
	} catch {
		return err(new AppError('Failed to apply preset', 500, 'INTERNAL_ERROR'));
	}
}

export async function resetTaConfigService(
	userId: string,
): Promise<Result<TechnicalAnalysisConfig>> {
	try {
		await deleteTaConfig(userId);
		return ok({ ...DEFAULT_TA_CONFIG });
	} catch {
		return err(new AppError('Failed to reset config', 500, 'INTERNAL_ERROR'));
	}
}
