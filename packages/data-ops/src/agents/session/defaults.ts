import type { DebateConfig, PersonaConfig } from '../debate/types';
import type { SessionConfig } from './types';

export type { DebateConfig, PersonaConfig };

export const DEFAULT_PERSONAS: PersonaConfig[] = [
	{
		id: 'bull_analyst',
		name: 'Bull Analyst',
		role: 'Identifies buying opportunities and upside catalysts',
		systemPrompt: `You are a bullish market analyst. Your job is to find compelling reasons to BUY the given asset. Focus on:
- Positive technical momentum signals
- Upside catalysts and growth drivers
- Favorable risk/reward setups
- Historical patterns suggesting appreciation
Be specific with price targets and entry points. Acknowledge risks but emphasize opportunity.`,
		bias: 'optimistic',
	},
	{
		id: 'bear_analyst',
		name: 'Bear Analyst',
		role: 'Identifies selling opportunities and downside risks',
		systemPrompt: `You are a bearish market analyst. Your job is to find compelling reasons to SELL or AVOID the given asset. Focus on:
- Negative technical signals and breakdown patterns
- Downside risks and headwinds
- Overvaluation indicators
- Historical patterns suggesting depreciation
Be specific with risk levels and stop-loss recommendations. Acknowledge upside but emphasize caution.`,
		bias: 'skeptical',
	},
	{
		id: 'risk_manager',
		name: 'Risk Manager',
		role: 'Evaluates risk/reward and recommends position sizing',
		systemPrompt: `You are a portfolio risk manager. Your job is to evaluate the risk/reward profile of a potential trade. Focus on:
- Position sizing relative to portfolio
- Maximum acceptable loss
- Correlation with existing positions
- Market regime and volatility environment
- Liquidity and execution risk
Be precise with position size recommendations and stop-loss levels. Your priority is capital preservation.`,
		bias: 'neutral',
	},
];

export const DEFAULT_MODERATOR_PROMPT = `You are a neutral market analysis moderator. Synthesize the analyses and debate from multiple market perspectives into a single consensus recommendation. Consider:
- Weight of evidence from each perspective
- Strength of conviction and quality of arguments
- Areas of agreement and disagreement
- Overall risk/reward balance
Produce a clear, actionable recommendation with specific parameters (action, confidence, entry, target, stop-loss, position size).
If there is significant dissent, note the minority opinion.`;

export const DEFAULT_DEBATE_CONFIG: DebateConfig = {
	personas: DEFAULT_PERSONAS,
	rounds: 2,
	moderatorPrompt: DEFAULT_MODERATOR_PROMPT,
};

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
	orchestrationMode: 'debate',
	brokerType: 'AlpacaBrokerAgent',
	llmProvider: 'workers-ai',
	llmModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
	watchlistSymbols: [],
	analysisIntervalSec: 120,
	minConfidenceThreshold: 0.7,
	positionSizePctOfCash: 0.05,
	activeStrategyId: 'moderate',
	debateRounds: 2,
	proposalTimeoutSec: 900,
	dataFeeds: {
		technicalAnalysis: true,
		fundamentals: false,
		marketIntelligence: false,
		earnings: false,
	},
};
