import type { TechnicalIndicators, TechnicalSignal } from '../../agents/ta/types';

export function detectSignals(ind: TechnicalIndicators): TechnicalSignal[] {
	const signals: TechnicalSignal[] = [];

	if (ind.rsi_14 !== null) {
		if (ind.rsi_14 < 30) {
			signals.push({
				type: 'rsi_oversold',
				direction: 'bullish',
				strength: Math.min(1, (30 - ind.rsi_14) / 30),
				description: `RSI at ${ind.rsi_14.toFixed(1)} -- oversold`,
			});
		} else if (ind.rsi_14 > 70) {
			signals.push({
				type: 'rsi_overbought',
				direction: 'bearish',
				strength: Math.min(1, (ind.rsi_14 - 70) / 30),
				description: `RSI at ${ind.rsi_14.toFixed(1)} -- overbought`,
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

	if (ind.sma_50 !== null && ind.sma_200 !== null) {
		if (ind.sma_50 > ind.sma_200) {
			signals.push({
				type: 'golden_cross_active',
				direction: 'bullish',
				strength: Math.min(1, ((ind.sma_50 - ind.sma_200) / ind.sma_200) * 10),
				description: `Golden cross active (SMA50 ${ind.sma_50.toFixed(2)} > SMA200 ${ind.sma_200.toFixed(2)})`,
			});
		} else {
			signals.push({
				type: 'death_cross_active',
				direction: 'bearish',
				strength: Math.min(1, ((ind.sma_200 - ind.sma_50) / ind.sma_200) * 10),
				description: `Death cross active (SMA50 ${ind.sma_50.toFixed(2)} < SMA200 ${ind.sma_200.toFixed(2)})`,
			});
		}
	}

	if (ind.relative_volume !== null && ind.relative_volume > 2.0) {
		signals.push({
			type: 'high_volume',
			direction: 'neutral',
			strength: Math.min(1, (ind.relative_volume - 1) / 4),
			description: `Volume ${ind.relative_volume.toFixed(1)}x above 20-day average`,
		});
	}

	return signals;
}
