/** TradingConfig that blocks nothing */
export const permissiveTradingConfig = {
	tradingHoursOnly: false,
	maxDailyLossPct: 1.0,
	cooldownMinutesAfterLoss: 0,
	tickerBlacklist: [],
	tickerAllowlist: null,
	allowShortSelling: true,
	maxPositions: 100,
	maxNotionalPerTrade: 1_000_000,
	maxPositionValue: 1_000_000,
	takeProfitPct: 0.1,
	stopLossPct: 0.05,
	proposalTimeoutSec: 900,
	llmTemperature: 0.7,
	llmMaxTokens: 2048,
	scoreWindows: [5, 20],
	confidenceDisplayHigh: 0.8,
	confidenceDisplayMed: 0.5,
};

/** TradingConfig with strict risk limits */
export const strictTradingConfig = {
	...permissiveTradingConfig,
	tradingHoursOnly: true,
	maxDailyLossPct: 0.02,
	cooldownMinutesAfterLoss: 30,
	allowShortSelling: false,
	maxPositions: 3,
	maxNotionalPerTrade: 5_000,
	maxPositionValue: 10_000,
};

// --- TA Agent fixtures ---

import type { Bar, TechnicalIndicators, TechnicalSignal } from '@repo/data-ops/agents/ta/types';

/** 65 sample bars for TA tests (exceeds minBarsRequired of 50) */
export const sampleBars: Bar[] = Array.from({ length: 65 }, (_, i) => ({
	t: new Date(2024, 0, i + 1).toISOString(),
	o: 145 + Math.sin(i / 5) * 5,
	h: 148 + Math.sin(i / 5) * 5,
	l: 142 + Math.sin(i / 5) * 5,
	c: 146 + Math.sin(i / 5) * 5,
	v: 1000000 + i * 10000,
	n: 5000 + i * 100,
	vw: 146 + Math.sin(i / 5) * 5,
}));

export const sampleIndicators: TechnicalIndicators = {
	symbol: 'AAPL',
	timestamp: '2024-01-15T00:00:00.000Z',
	price: 150.0,
	sma: [
		{ period: 20, value: 148 },
		{ period: 50, value: 145 },
		{ period: 200, value: 140 },
	],
	ema: [
		{ period: 12, value: 149 },
		{ period: 26, value: 147 },
	],
	rsi: 55,
	macd: { macd: 1.2, signal: 0.8, histogram: 0.4 },
	bollinger: { upper: 160, middle: 150, lower: 140, width: 0.133 },
	atr: 3.5,
	volumeSma: 800000,
	relativeVolume: 1.25,
};

export const sampleSignals: TechnicalSignal[] = [
	{ type: 'rsi_oversold', direction: 'bullish', strength: 0.7, description: 'RSI below 30' },
	{ type: 'macd_crossover', direction: 'bullish', strength: 0.6, description: 'MACD crossed signal' },
];

// --- Pipeline Orchestrator fixtures ---

import type { StrategyTemplate } from '@repo/data-ops/agents/llm/types';

export const sampleRecommendation = {
	action: 'buy' as const, confidence: 0.85, rationale: 'Strong buy signal',
	entry_price: 150, target_price: 165, stop_loss: 142,
	position_size_pct: 5, timeframe: 'swing', risks: ['market risk'],
};

export const sampleRiskValidation = {
	approved: true, adjustedPositionSize: null,
	warnings: [], rationale: 'Risk approved',
};

export const sampleStrategy: StrategyTemplate = {
	id: 'moderate', name: 'Moderate Growth',
	riskTolerance: 'moderate', positionSizeBias: 0.5,
	preferredTimeframe: 'swing',
	analysisFocus: ['momentum', 'value'],
	customPromptSuffix: '',
};

// --- Debate Orchestrator fixtures ---

import type { DebateConfig, PersonaConfig } from '@repo/data-ops/agents/debate/types';

export const samplePersonaConfigs: PersonaConfig[] = [
	{
		id: 'aggressive', name: 'Aggressive Trader',
		role: 'momentum trader', systemPrompt: 'You are an aggressive momentum trader.',
		bias: 'bullish',
	},
	{
		id: 'conservative', name: 'Conservative Analyst',
		role: 'value investor', systemPrompt: 'You are a conservative value investor.',
		bias: 'bearish',
	},
	{
		id: 'technical', name: 'Technical Analyst',
		role: 'technical analyst', systemPrompt: 'You focus on chart patterns and indicators.',
		bias: 'neutral',
	},
];

export const sampleDebateConfig: DebateConfig = {
	personas: samplePersonaConfigs,
	rounds: 2,
	moderatorPrompt: 'You are a neutral moderator synthesizing diverse views.',
};
