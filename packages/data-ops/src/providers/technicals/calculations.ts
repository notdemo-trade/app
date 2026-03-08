import type { Bar, EMAResult, SMAResult, TechnicalIndicators } from '../../agents/ta/types';
import { DEFAULT_TA_CONFIG } from '../../ta-config/presets';
import type { TechnicalAnalysisConfig } from '../../ta-config/schema';

export function computeTechnicals(
	symbol: string,
	bars: Bar[],
	config: TechnicalAnalysisConfig = DEFAULT_TA_CONFIG,
): TechnicalIndicators {
	const closes = bars.map((b) => b.c);
	const highs = bars.map((b) => b.h);
	const lows = bars.map((b) => b.l);
	const volumes = bars.map((b) => b.v);
	const latest = bars[bars.length - 1];
	if (!latest) throw new Error('Empty bars array');

	const sma: SMAResult[] = config.smaPeriods.map((period) => ({
		period,
		value: calculateSMA(closes, period),
	}));

	const ema: EMAResult[] = config.emaPeriods.map((period) => ({
		period,
		value: calculateEMA(closes, period),
	}));

	return {
		symbol,
		timestamp: latest.t,
		price: latest.c,
		sma,
		ema,
		rsi: calculateRSI(closes, config.rsiPeriod),
		macd: calculateMACD(closes, config.emaPeriods, config.macdSignalPeriod),
		bollinger: calculateBollingerBands(closes, config.bollingerPeriod, config.bollingerStdDev),
		atr: calculateATR(highs, lows, closes, config.atrPeriod),
		volumeSma: calculateSMA(volumes, config.volumeSmaPeriod),
		relativeVolume: calculateRelativeVolume(volumes, config.volumeSmaPeriod),
	};
}

function calculateSMA(data: number[], period: number): number | null {
	if (data.length < period) return null;
	const slice = data.slice(-period);
	return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(data: number[], period: number): number | null {
	if (data.length < period) return null;
	const k = 2 / (period + 1);
	let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
	for (let i = period; i < data.length; i++) {
		ema = (data[i] ?? 0) * k + ema * (1 - k);
	}
	return ema;
}

function calculateRSI(closes: number[], period: number): number | null {
	if (closes.length < period + 1) return null;
	let avgGain = 0;
	let avgLoss = 0;

	for (let i = 1; i <= period; i++) {
		const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
		if (diff > 0) avgGain += diff;
		else avgLoss += Math.abs(diff);
	}
	avgGain /= period;
	avgLoss /= period;

	for (let i = period + 1; i < closes.length; i++) {
		const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
		if (diff > 0) {
			avgGain = (avgGain * (period - 1) + diff) / period;
			avgLoss = (avgLoss * (period - 1)) / period;
		} else {
			avgGain = (avgGain * (period - 1)) / period;
			avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
		}
	}

	if (avgLoss === 0) return 100;
	const rs = avgGain / avgLoss;
	return 100 - 100 / (1 + rs);
}

function calculateMACD(
	closes: number[],
	emaPeriods: number[] = [12, 26],
	signalPeriod: number = 9,
): { macd: number; signal: number; histogram: number } | null {
	const sorted = [...emaPeriods].sort((a, b) => a - b);
	const fastPeriod = sorted[0];
	const slowPeriod = sorted[1];
	if (fastPeriod === undefined || slowPeriod === undefined) return null;

	const emaFast = calculateEMA(closes, fastPeriod);
	const emaSlow = calculateEMA(closes, slowPeriod);
	if (emaFast === null || emaSlow === null) return null;

	const macdLine: number[] = [];
	const kFast = 2 / (fastPeriod + 1);
	const kSlow = 2 / (slowPeriod + 1);
	let eFast = closes.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
	let eSlow = closes.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;

	for (let i = slowPeriod; i < closes.length; i++) {
		const c = closes[i] ?? 0;
		eFast = c * kFast + eFast * (1 - kFast);
		eSlow = c * kSlow + eSlow * (1 - kSlow);
		macdLine.push(eFast - eSlow);
	}

	if (macdLine.length < signalPeriod) return null;
	const signalLine = calculateEMA(macdLine, signalPeriod);
	if (signalLine === null) return null;

	const macdValue = macdLine[macdLine.length - 1] ?? 0;
	return { macd: macdValue, signal: signalLine, histogram: macdValue - signalLine };
}

function calculateBollingerBands(
	closes: number[],
	period: number,
	stdDevMultiplier: number,
): { upper: number; middle: number; lower: number; width: number } | null {
	if (closes.length < period) return null;
	const slice = closes.slice(-period);
	const mean = slice.reduce((a, b) => a + b, 0) / period;
	const variance = slice.reduce((sum, val) => sum + (val - mean) ** 2, 0) / period;
	const stdDev = Math.sqrt(variance);
	const upper = mean + stdDevMultiplier * stdDev;
	const lower = mean - stdDevMultiplier * stdDev;
	return { upper, middle: mean, lower, width: (upper - lower) / mean };
}

function calculateATR(
	highs: number[],
	lows: number[],
	closes: number[],
	period: number,
): number | null {
	if (highs.length < period + 1) return null;
	const trueRanges: number[] = [];
	for (let i = 1; i < highs.length; i++) {
		const h = highs[i] ?? 0;
		const l = lows[i] ?? 0;
		const prevC = closes[i - 1] ?? 0;
		const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
		trueRanges.push(tr);
	}
	let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
	for (let i = period; i < trueRanges.length; i++) {
		atr = (atr * (period - 1) + (trueRanges[i] ?? 0)) / period;
	}
	return atr;
}

function calculateRelativeVolume(volumes: number[], period: number): number | null {
	if (volumes.length < period + 1) return null;
	const avgVol = volumes.slice(-(period + 1), -1).reduce((a, b) => a + b, 0) / period;
	if (avgVol === 0) return null;
	const lastVol = volumes[volumes.length - 1];
	if (lastVol === undefined) return null;
	return lastVol / avgVol;
}
