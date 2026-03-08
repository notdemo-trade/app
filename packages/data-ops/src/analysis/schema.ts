import { z } from 'zod';

export const TimeframeSchema = z.enum(['1Min', '5Min', '15Min', '1Hour', '1Day']);

export const BarSchema = z.object({
	t: z.string(),
	o: z.number(),
	h: z.number(),
	l: z.number(),
	c: z.number(),
	v: z.number(),
	n: z.number(),
	vw: z.number(),
});

export const MACDSchema = z.object({
	macd: z.number(),
	signal: z.number(),
	histogram: z.number(),
});

export const BollingerSchema = z.object({
	upper: z.number(),
	middle: z.number(),
	lower: z.number(),
	width: z.number(),
});

export const SMAResultSchema = z.object({
	period: z.number(),
	value: z.number().nullable(),
});

export const EMAResultSchema = z.object({
	period: z.number(),
	value: z.number().nullable(),
});

export const TechnicalIndicatorsSchema = z.object({
	symbol: z.string(),
	timestamp: z.string(),
	price: z.number(),
	sma: z.array(SMAResultSchema),
	ema: z.array(EMAResultSchema),
	rsi: z.number().nullable(),
	macd: MACDSchema.nullable(),
	bollinger: BollingerSchema.nullable(),
	atr: z.number().nullable(),
	volumeSma: z.number().nullable(),
	relativeVolume: z.number().nullable(),
});

export const TechnicalSignalSchema = z.object({
	type: z.string(),
	direction: z.enum(['bullish', 'bearish', 'neutral']),
	strength: z.number().min(0).max(1),
	description: z.string(),
});

export const AnalysisResultSchema = z.object({
	symbol: z.string(),
	timeframe: TimeframeSchema,
	indicators: TechnicalIndicatorsSchema,
	signals: z.array(TechnicalSignalSchema),
	bars: z.array(BarSchema),
});

export const GetAnalysisRequestSchema = z.object({
	symbol: z.string().min(1).max(10),
	timeframe: TimeframeSchema.optional().default('1Day'),
	includeBars: z.coerce.boolean().optional().default(true),
});

export const BatchAnalysisRequestSchema = z.object({
	symbols: z.array(z.string().min(1).max(10)).min(1).max(20),
	timeframe: TimeframeSchema.optional().default('1Day'),
});

export type Timeframe = z.infer<typeof TimeframeSchema>;
export type Bar = z.infer<typeof BarSchema>;
export type TechnicalIndicators = z.infer<typeof TechnicalIndicatorsSchema>;
export type TechnicalSignal = z.infer<typeof TechnicalSignalSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
