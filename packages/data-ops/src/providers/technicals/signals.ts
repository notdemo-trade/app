import type { TechnicalIndicators, TechnicalSignal } from '../../agents/ta/types';
import { DEFAULT_TA_CONFIG } from '../../ta-config/presets';
import type { TechnicalAnalysisConfig } from '../../ta-config/schema';

export function detectSignals(
	ind: TechnicalIndicators,
	config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG,
): TechnicalSignal[] {
	const signals: TechnicalSignal[] = [];

	if (ind.rsi !== null) {
		if (ind.rsi < config.rsiOversold) {
			signals.push({
				type: 'rsi_oversold',
				direction: 'bullish',
				strength: Math.min(1, (config.rsiOversold - ind.rsi) / config.rsiOversold),
				description: `RSI at ${ind.rsi.toFixed(1)} -- oversold (threshold: ${config.rsiOversold})`,
			});
		} else if (ind.rsi > config.rsiOverbought) {
			signals.push({
				type: 'rsi_overbought',
				direction: 'bearish',
				strength: Math.min(1, (ind.rsi - config.rsiOverbought) / (100 - config.rsiOverbought)),
				description: `RSI at ${ind.rsi.toFixed(1)} -- overbought (threshold: ${config.rsiOverbought})`,
			});
		}
	}

	if (ind.macd !== null) {
		if (ind.macd.histogram > 0 && ind.macd.macd > 0) {
			signals.push({
				type: 'macd_bullish',
				direction: 'bullish',
				strength: Math.min(1, (Math.abs(ind.macd.histogram) / ind.price) * 100),
				description: `MACD bullish crossover (histogram: ${ind.macd.histogram.toFixed(3)})`,
			});
		} else if (ind.macd.histogram < 0 && ind.macd.macd < 0) {
			signals.push({
				type: 'macd_bearish',
				direction: 'bearish',
				strength: Math.min(1, (Math.abs(ind.macd.histogram) / ind.price) * 100),
				description: `MACD bearish crossover (histogram: ${ind.macd.histogram.toFixed(3)})`,
			});
		}
	}

	if (ind.bollinger !== null) {
		const { upper, lower } = ind.bollinger;
		if (ind.price <= lower) {
			signals.push({
				type: 'bb_lower_touch',
				direction: 'bullish',
				strength: Math.min(1, ((lower - ind.price) / ind.price) * 100 + 0.3),
				description: `Price touching lower Bollinger Band ($${lower.toFixed(2)})`,
			});
		} else if (ind.price >= upper) {
			signals.push({
				type: 'bb_upper_touch',
				direction: 'bearish',
				strength: Math.min(1, ((ind.price - upper) / ind.price) * 100 + 0.3),
				description: `Price touching upper Bollinger Band ($${upper.toFixed(2)})`,
			});
		}
	}

	// SMA cross signals: use two longest SMA periods from config
	const sortedSma = [...ind.sma]
		.filter((s) => s.value !== null)
		.sort((a, b) => a.period - b.period);

	if (sortedSma.length >= 2) {
		const medium = sortedSma[sortedSma.length - 2];
		const long = sortedSma[sortedSma.length - 1];

		if (medium && long && medium.value !== null && long.value !== null) {
			if (medium.value > long.value) {
				signals.push({
					type: 'golden_cross_active',
					direction: 'bullish',
					strength: Math.min(1, ((medium.value - long.value) / long.value) * 10),
					description: `Golden cross active (SMA${medium.period} ${medium.value.toFixed(2)} > SMA${long.period} ${long.value.toFixed(2)})`,
				});
			} else {
				signals.push({
					type: 'death_cross_active',
					direction: 'bearish',
					strength: Math.min(1, ((long.value - medium.value) / long.value) * 10),
					description: `Death cross active (SMA${medium.period} ${medium.value.toFixed(2)} < SMA${long.period} ${long.value.toFixed(2)})`,
				});
			}
		}
	}

	if (ind.relativeVolume !== null && ind.relativeVolume > config.volumeSpikeMultiplier) {
		signals.push({
			type: 'high_volume',
			direction: 'neutral',
			strength: Math.min(1, (ind.relativeVolume - 1) / 4),
			description: `Volume ${ind.relativeVolume.toFixed(1)}x above ${config.volumeSmaPeriod}-day average (threshold: ${config.volumeSpikeMultiplier}x)`,
		});
	}

	return signals;
}
