import { z } from 'zod';

export const SessionConfigSchema = z.object({
	orchestrationMode: z.enum(['debate', 'pipeline']),
	brokerType: z.string().default('AlpacaBrokerAgent'),
	llmProvider: z
		.enum(['openai', 'anthropic', 'google', 'xai', 'deepseek', 'workers-ai'])
		.default('workers-ai'),
	llmModel: z.string().default('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
	watchlistSymbols: z.array(z.string()).default([]),
	analysisIntervalSec: z.number().int().min(30).max(3600).default(120),
	minConfidenceThreshold: z.number().min(0).max(1).default(0.7),
	positionSizePctOfCash: z.number().min(0.01).max(0.5).default(0.05),
	activeStrategyId: z.string().default('moderate'),
	debateRounds: z.number().int().min(1).max(5).default(2),
	proposalTimeoutSec: z.number().int().min(60).max(3600).default(900),
});

export type SessionConfigInput = z.infer<typeof SessionConfigSchema>;

export const TradeProposalSchema = z.object({
	symbol: z.string(),
	action: z.enum(['buy', 'sell']),
	confidence: z.number().min(0).max(1),
	rationale: z.string(),
	entryPrice: z.number().nullable(),
	targetPrice: z.number().nullable(),
	stopLoss: z.number().nullable(),
	qty: z.number().nullable(),
	notional: z.number().nullable(),
	positionSizePct: z.number(),
	risks: z.array(z.string()),
	timeInForce: z.enum(['day', 'gtc', 'ioc', 'foc']).default('day'),
});

export const DiscussionMessageSchema = z.object({
	sender: z.union([
		z.object({ type: z.literal('system') }),
		z.object({ type: z.literal('data_agent'), name: z.string() }),
		z.object({ type: z.literal('analysis_agent'), name: z.string() }),
		z.object({ type: z.literal('persona'), persona: z.string() }),
		z.object({ type: z.literal('moderator') }),
		z.object({ type: z.literal('broker'), name: z.string() }),
		z.object({ type: z.literal('user') }),
	]),
	phase: z.enum([
		'data_collection',
		'analysis',
		'debate_round',
		'consensus',
		'proposal',
		'human_decision',
		'execution',
		'completed',
	]),
	content: z.string(),
	metadata: z.record(z.string(), z.unknown()).default({}),
});
