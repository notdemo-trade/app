import { getTaConfig } from './queries';
import type { TechnicalAnalysisConfig } from './schema';

/**
 * Resolve TA config for a user. Returns defaults if user has no config.
 * Merges any partial overrides on top.
 */
export async function resolveTaConfig(
	userId: string,
	overrides?: Partial<TechnicalAnalysisConfig>,
): Promise<TechnicalAnalysisConfig> {
	const base = await getTaConfig(userId);
	if (!overrides) return base;
	return { ...base, ...overrides };
}
