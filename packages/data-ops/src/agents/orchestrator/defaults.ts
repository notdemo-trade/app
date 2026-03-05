import type { StrategyTemplate } from '../llm/types';
import type { AgentEntitlement, OrchestratorConfig } from './types';

export function getDefaultOrchestratorConfig(): OrchestratorConfig {
	return {
		dataPollIntervalSec: 30,
		analystIntervalSec: 120,
		minSentimentScore: 0.6,
		minAnalystConfidence: 0.7,
		positionSizePctOfCash: 0.05,
		maxPositionValue: 5000,
		maxPositions: 5,
		takeProfitPct: 0.15,
		stopLossPct: 0.05,
		autoApproveEnabled: false,
		autoApproveMaxNotional: 1000,
		watchlistSymbols: [],
		tickerBlacklist: [],
		activeStrategyId: 'moderate',
	};
}

export const DEFAULT_STRATEGIES: StrategyTemplate[] = [
	{
		id: 'conservative',
		name: 'Conservative',
		riskTolerance: 'conservative',
		positionSizeBias: 0.02,
		preferredTimeframe: 'position',
		analysisFocus: ['value', 'fundamentals', 'macro'],
	},
	{
		id: 'moderate',
		name: 'Moderate',
		riskTolerance: 'moderate',
		positionSizeBias: 0.05,
		preferredTimeframe: 'swing',
		analysisFocus: ['momentum', 'value', 'sentiment'],
	},
	{
		id: 'aggressive',
		name: 'Aggressive',
		riskTolerance: 'aggressive',
		positionSizeBias: 0.1,
		preferredTimeframe: 'intraday',
		analysisFocus: ['momentum', 'sentiment', 'technicals'],
	},
];

export const DEFAULT_ENTITLEMENTS: AgentEntitlement[] = [
	{ agentType: 'TechnicalAnalysisAgent', enabled: true },
	{ agentType: 'LLMAnalysisAgent', enabled: true },
	{ agentType: 'StockTwitsAgent', enabled: false },
	{ agentType: 'TwitterAgent', enabled: false },
	{ agentType: 'SecFilingsAgent', enabled: false },
	{ agentType: 'FredAgent', enabled: false },
];
