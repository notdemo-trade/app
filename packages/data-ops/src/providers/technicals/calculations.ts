import type { Bar, TechnicalIndicators } from '../../agents/ta/types';

export function computeTechnicals(symbol: string, bars: Bar[]): TechnicalIndicators {
	const closes = bars.map((b) => b.c);
	const highs = bars.map((b) => b.h);
	const lows = bars.map((b) => b.l);
	const volumes = bars.map((b) => b.v);
	const latest = bars[bars.length - 1];
	if (!latest) throw new Error('Empty bars array');

	return {
		symbol,
		timestamp: latest.t,
		price: latest.c,
		sma_20: calculateSMA(closes, 20),
		sma_50: calculateSMA(closes, 50),
		sma_200: calculateSMA(closes, 200),
		ema_12: calculateEMA(closes, 12),
		ema_26: calculateEMA(closes, 26),
		rsi_14: calculateRSI(closes, 14),
		macd: calculateMACD(closes),
		bollinger: calculateBollingerBands(closes, 20, 2),
		atr_14: calculateATR(highs, lows, closes, 14),
		volume_sma_20: calculateSMA(volumes, 20),
		relative_volume: calculateRelativeVolume(volumes, 20),
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
): { macd: number; signal: number; histogram: number } | null {
	const ema12 = calculateEMA(closes, 12);
	const ema26 = calculateEMA(closes, 26);
	if (ema12 === null || ema26 === null) return null;

	const macdLine: number[] = [];
	const k12 = 2 / 13;
	const k26 = 2 / 27;
	let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
	let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

	for (let i = 26; i < closes.length; i++) {
		const c = closes[i] ?? 0;
		e12 = c * k12 + e12 * (1 - k12);
		e26 = c * k26 + e26 * (1 - k26);
		macdLine.push(e12 - e26);
	}

	if (macdLine.length < 9) return null;
	const signalLine = calculateEMA(macdLine, 9);
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
