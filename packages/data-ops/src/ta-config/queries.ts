import { eq } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { DEFAULT_TA_CONFIG } from './presets';
import type { TechnicalAnalysisConfig } from './schema';
import { technicalAnalysisConfig } from './table';

/**
 * Get user's TA config. Returns defaults if no row exists.
 */
export async function getTaConfig(userId: string): Promise<TechnicalAnalysisConfig> {
	const db = getDb();
	const rows = await db
		.select()
		.from(technicalAnalysisConfig)
		.where(eq(technicalAnalysisConfig.userId, userId))
		.limit(1);

	const row = rows[0];
	if (!row) return { ...DEFAULT_TA_CONFIG };

	return {
		profileName: row.profileName,
		smaPeriods: row.smaPeriods,
		emaPeriods: row.emaPeriods,
		rsiPeriod: row.rsiPeriod,
		bollingerPeriod: row.bollingerPeriod,
		bollingerStdDev: row.bollingerStdDev,
		atrPeriod: row.atrPeriod,
		volumeSmaPeriod: row.volumeSmaPeriod,
		macdSignalPeriod: row.macdSignalPeriod,
		rsiOversold: row.rsiOversold,
		rsiOverbought: row.rsiOverbought,
		volumeSpikeMultiplier: row.volumeSpikeMultiplier,
		minBarsRequired: row.minBarsRequired,
		defaultBarsToFetch: row.defaultBarsToFetch,
		cacheFreshnessSec: row.cacheFreshnessSec,
	};
}

/**
 * Upsert user's TA config. Creates row if missing, updates if exists.
 */
export async function upsertTaConfig(
	userId: string,
	config: TechnicalAnalysisConfig,
): Promise<TechnicalAnalysisConfig> {
	const db = getDb();
	const now = new Date();

	await db
		.insert(technicalAnalysisConfig)
		.values({
			userId,
			...config,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: technicalAnalysisConfig.userId,
			set: {
				...config,
				updatedAt: now,
			},
		});

	return config;
}

/**
 * Delete user's TA config (reset to defaults).
 */
export async function deleteTaConfig(userId: string): Promise<void> {
	const db = getDb();
	await db.delete(technicalAnalysisConfig).where(eq(technicalAnalysisConfig.userId, userId));
}
