export interface Bar {
	t: string;
	o: number;
	h: number;
	l: number;
	c: number;
	v: number;
	n: number;
	vw: number;
}

export interface SMAResult {
	period: number;
	value: number | null;
}

export interface EMAResult {
	period: number;
	value: number | null;
}

export interface TechnicalIndicators {
	symbol: string;
	timestamp: string;
	price: number;
	sma: SMAResult[];
	ema: EMAResult[];
	rsi: number | null;
	macd: { macd: number; signal: number; histogram: number } | null;
	bollinger: { upper: number; middle: number; lower: number; width: number } | null;
	atr: number | null;
	volumeSma: number | null;
	relativeVolume: number | null;
}

export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

export interface TechnicalSignal {
	type: string;
	direction: SignalDirection;
	strength: number;
	description: string;
}

export interface AnalysisResult {
	symbol: string;
	timeframe: string;
	indicators: TechnicalIndicators;
	signals: TechnicalSignal[];
	bars: Bar[];
}

export type Timeframe = '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';

export interface TAAgentState {
	lastComputeAt: string | null;
	symbol: string;
	latestPrice: number | null;
	signalCount: number;
	errorCount: number;
	lastError: string | null;
}

export interface TAAgentRPC {
	getSignals(since?: string): Promise<TechnicalSignal[]>;
	getIndicators(): Promise<TechnicalIndicators | null>;
	analyze(timeframe?: Timeframe, bars?: Bar[], configOverride?: unknown): Promise<AnalysisResult>;
}
