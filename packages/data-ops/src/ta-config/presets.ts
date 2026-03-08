import type { TechnicalAnalysisConfig } from './schema';

export const DEFAULT_TA_CONFIG: TechnicalAnalysisConfig = {
	profileName: 'default',
	smaPeriods: [20, 50, 200],
	emaPeriods: [12, 26],
	rsiPeriod: 14,
	bollingerPeriod: 20,
	bollingerStdDev: 2.0,
	atrPeriod: 14,
	volumeSmaPeriod: 20,
	macdSignalPeriod: 9,
	rsiOversold: 30,
	rsiOverbought: 70,
	volumeSpikeMultiplier: 2.0,
	minBarsRequired: 50,
	defaultBarsToFetch: 250,
	cacheFreshnessSec: 60,
};

export const DAY_TRADER_CONFIG: TechnicalAnalysisConfig = {
	profileName: 'day-trader',
	smaPeriods: [5, 10, 20],
	emaPeriods: [8, 21],
	rsiPeriod: 7,
	bollingerPeriod: 10,
	bollingerStdDev: 2.0,
	atrPeriod: 7,
	volumeSmaPeriod: 10,
	macdSignalPeriod: 5,
	rsiOversold: 25,
	rsiOverbought: 75,
	volumeSpikeMultiplier: 1.5,
	minBarsRequired: 20,
	defaultBarsToFetch: 100,
	cacheFreshnessSec: 15,
};

export const SWING_TRADER_CONFIG: TechnicalAnalysisConfig = {
	profileName: 'swing-trader',
	smaPeriods: [10, 21, 50],
	emaPeriods: [12, 26],
	rsiPeriod: 14,
	bollingerPeriod: 20,
	bollingerStdDev: 2.0,
	atrPeriod: 14,
	volumeSmaPeriod: 20,
	macdSignalPeriod: 9,
	rsiOversold: 30,
	rsiOverbought: 70,
	volumeSpikeMultiplier: 2.0,
	minBarsRequired: 50,
	defaultBarsToFetch: 200,
	cacheFreshnessSec: 60,
};

export const POSITION_TRADER_CONFIG: TechnicalAnalysisConfig = {
	profileName: 'position-trader',
	smaPeriods: [50, 100, 200],
	emaPeriods: [26, 50],
	rsiPeriod: 21,
	bollingerPeriod: 30,
	bollingerStdDev: 2.5,
	atrPeriod: 21,
	volumeSmaPeriod: 30,
	macdSignalPeriod: 12,
	rsiOversold: 35,
	rsiOverbought: 65,
	volumeSpikeMultiplier: 2.5,
	minBarsRequired: 100,
	defaultBarsToFetch: 500,
	cacheFreshnessSec: 120,
};

export const PRESET_CONFIGS: Record<string, TechnicalAnalysisConfig> = {
	default: DEFAULT_TA_CONFIG,
	'day-trader': DAY_TRADER_CONFIG,
	'swing-trader': SWING_TRADER_CONFIG,
	'position-trader': POSITION_TRADER_CONFIG,
};

export const PRESET_LABELS: Record<string, string> = {
	default: 'Default (Standard)',
	'day-trader': 'Day Trader',
	'swing-trader': 'Swing Trader',
	'position-trader': 'Position Trader',
};

export const PRESET_DESCRIPTIONS: Record<string, string> = {
	default: 'Industry-standard periods and thresholds. Balanced for general use.',
	'day-trader': 'Short periods for intraday signals. Faster reaction to price changes.',
	'swing-trader': 'Medium periods for multi-day holds. Standard signal sensitivity.',
	'position-trader': 'Long periods for multi-week holds. Fewer but higher-conviction signals.',
};
