import { vi } from 'vitest';

// --- Mock 'agents' SDK ---
let mockRegistry: Map<symbol, unknown> = new Map();
export function registerMockAgent(namespace: symbol, mock: unknown) {
	mockRegistry.set(namespace, mock);
}
export function clearMockRegistry() {
	mockRegistry = new Map();
}

vi.mock('agents', () => ({
	Agent: class MockAgent {},
	callable: () => (_target: unknown, _ctx: unknown) => {},
	getAgentByName: vi.fn().mockImplementation(async (namespace: symbol) => {
		return mockRegistry.get(namespace) ?? {};
	}),
}));

// --- Mock data-ops modules ---
vi.mock('@repo/data-ops/database/setup', () => ({
	initDatabase: vi.fn(),
	getDb: vi.fn(),
}));

vi.mock('@repo/data-ops/trading-config', () => ({
	getTradingConfig: vi.fn().mockResolvedValue(null),
	resolveTaskLLMParams: vi.fn().mockImplementation(
		(temp: number, maxTokens: number) => ({ temperature: temp, maxTokens }),
	),
}));

vi.mock('@repo/data-ops/debate-persona', () => ({
	getDebatePersonas: vi.fn().mockResolvedValue([]),
	seedDefaultPersonas: vi.fn().mockResolvedValue([]),
}));

vi.mock('@repo/data-ops/agents/enrichment/queries', () => ({
	getEnrichmentForSymbol: vi.fn().mockResolvedValue({
		fundamentals: undefined,
		marketIntelligence: undefined,
		earnings: undefined,
	}),
}));

vi.mock('@repo/data-ops/credential', () => ({
	getCredential: vi.fn().mockResolvedValue({ apiKey: 'test', apiSecret: 'test' }),
}));

vi.mock('@repo/data-ops/providers/llm', () => ({
	createLLMProvider: vi.fn().mockReturnValue({
		complete: vi.fn().mockResolvedValue({
			content: JSON.stringify({
				action: 'buy', confidence: 0.8, rationale: 'test',
				entry_price: 150, target_price: 165, stop_loss: 142,
				position_size_pct: 5, timeframe: 'swing', risks: ['market risk'],
			}),
			usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
		}),
	}),
	createLanguageModel: vi.fn().mockReturnValue({}),
	estimateCost: vi.fn().mockReturnValue(0.005),
	TRADE_RECOMMENDATION_PROMPT: 'Recommend: ',
	RESEARCH_REPORT_PROMPT: 'Report: ',
	EVENT_CLASSIFICATION_PROMPT: 'Classify: ',
	PERSONA_ANALYSIS_PROMPT: 'Persona: ',
	DEBATE_ROUND_PROMPT: 'Debate: ',
	CONSENSUS_SYNTHESIS_PROMPT: 'Consensus: ',
	RISK_VALIDATION_PROMPT: 'Risk: ',
}));

vi.mock('@repo/data-ops/llm-analysis', () => ({
	insertAnalysis: vi.fn().mockResolvedValue(undefined),
	updateUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@repo/data-ops/telegram', () => ({
	dispatchNotification: vi.fn().mockResolvedValue({ sent: false }),
	buildProposalMessage: vi.fn().mockReturnValue({ text: '', keyboard: [] }),
	buildProposalUpdatedMessage: vi.fn().mockReturnValue(''),
	buildRiskAlertMessage: vi.fn().mockReturnValue(''),
	buildTradeExecutedMessage: vi.fn().mockReturnValue(''),
	buildTradeFailedMessage: vi.fn().mockReturnValue(''),
}));

// --- Mock Alpaca provider ---
vi.mock('@repo/data-ops/providers/alpaca', () => {
	const mockRequest = vi.fn();
	const mockGetAccount = vi.fn();
	const mockGetPositions = vi.fn();
	const mockGetClock = vi.fn();
	const mockGetPortfolioHistory = vi.fn();
	// Use regular functions so they work with `new`
	function MockAlpacaClient() {
		return { request: mockRequest };
	}
	function MockAlpacaTradingProvider() {
		return {
			getAccount: mockGetAccount,
			getPositions: mockGetPositions,
			getClock: mockGetClock,
			getPortfolioHistory: mockGetPortfolioHistory,
		};
	}
	return {
		AlpacaClient: MockAlpacaClient,
		AlpacaTradingProvider: MockAlpacaTradingProvider,
		_mockRequest: mockRequest,
		_mockGetAccount: mockGetAccount,
		_mockGetPositions: mockGetPositions,
		_mockGetClock: mockGetClock,
		_mockGetPortfolioHistory: mockGetPortfolioHistory,
	};
});

// --- Mock TA-related modules ---
vi.mock('@repo/data-ops/market-data-bars', () => ({
	getBarsForSymbol: vi.fn().mockResolvedValue([]),
}));

vi.mock('@repo/data-ops/providers/technicals', () => ({
	computeTechnicals: vi.fn().mockReturnValue({
		symbol: 'AAPL',
		timestamp: new Date().toISOString(),
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
	}),
	detectSignals: vi.fn().mockReturnValue([
		{ type: 'rsi_oversold', direction: 'bullish', strength: 0.7, description: 'RSI below 30' },
	]),
}));

vi.mock('@repo/data-ops/signal', () => ({
	insertSignal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@repo/data-ops/ta-config', () => ({
	getTaConfig: vi.fn().mockResolvedValue({
		profileName: 'default',
		smaPeriods: [20, 50, 200],
		emaPeriods: [12, 26],
		rsiPeriod: 14,
		bollingerPeriod: 20,
		bollingerStdDev: 2,
		atrPeriod: 14,
		volumeSmaPeriod: 20,
		macdSignalPeriod: 9,
		rsiOversold: 30,
		rsiOverbought: 70,
		volumeSpikeMultiplier: 2.0,
		minBarsRequired: 50,
		defaultBarsToFetch: 250,
		cacheFreshnessSec: 60,
	}),
}));

// --- Mock AIChatAgent base class ---
vi.mock('@cloudflare/ai-chat', () => ({
	AIChatAgent: class MockAIChatAgent {
		maxPersistedMessages = 500;
		initialState = {};
	},
}));
