import type { TechnicalIndicators } from '../../agents/ta/types';

/**
 * Helper for consumers that need a specific SMA period value.
 */
export function getSmaValue(indicators: TechnicalIndicators, period: number): number | null {
	return indicators.sma.find((s) => s.period === period)?.value ?? null;
}

/**
 * Helper for consumers that need a specific EMA period value.
 */
export function getEmaValue(indicators: TechnicalIndicators, period: number): number | null {
	return indicators.ema.find((e) => e.period === period)?.value ?? null;
}
