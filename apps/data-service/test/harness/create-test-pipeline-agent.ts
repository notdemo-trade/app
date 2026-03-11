import Database from 'better-sqlite3';
import { PipelineOrchestratorAgent } from '@/agents/pipeline-orchestrator-agent';
import { registerMockAgent } from '../setup';
import { createMockLLMAgent } from './mock-llm-agent';
import { sampleBars, sampleIndicators, sampleSignals } from './fixtures';
import { createSqlTag } from './sql-template';
import { vi } from 'vitest';

function createMockTAAgent(overrides?: Record<string, unknown>) {
	return {
		analyze: vi.fn().mockResolvedValue({
			symbol: 'AAPL', timeframe: '1Day',
			indicators: sampleIndicators,
			signals: sampleSignals,
			bars: sampleBars,
		}),
		getSignals: vi.fn().mockResolvedValue(sampleSignals),
		getIndicators: vi.fn().mockResolvedValue(sampleIndicators),
		...overrides,
	};
}

function createMockBrokerAgent(overrides?: Record<string, unknown>) {
	return {
		getAccount: vi.fn().mockResolvedValue({
			id: 'account-001', currency: 'USD', cash: 100_000,
			portfolioValue: 100_000, buyingPower: 200_000,
			daytradeCount: 0, status: 'ACTIVE',
		}),
		getPositions: vi.fn().mockResolvedValue([]),
		getClock: vi.fn().mockResolvedValue({ isOpen: true, nextOpenAt: 0, nextCloseAt: 0 }),
		placeOrder: vi.fn().mockResolvedValue({ id: 'order-001', filledQty: 10, filledAvgPrice: 150 }),
		getOrderHistory: vi.fn().mockResolvedValue([]),
		...overrides,
	};
}

export async function createTestPipelineAgent(overrides?: {
	llm?: Record<string, unknown>;
	ta?: Record<string, unknown>;
	broker?: Record<string, unknown>;
}) {
	const db = new Database(':memory:');
	const sqlTag = createSqlTag(db);

	const agent = Object.create(PipelineOrchestratorAgent.prototype) as PipelineOrchestratorAgent;

	const stateHistory: unknown[] = [];

	Object.defineProperty(agent, 'sql', { value: sqlTag, writable: true });
	Object.defineProperty(agent, 'name', {
		value: 'test-user-123:AAPL',
		writable: true,
	});

	const defaultState = {
		activePipelineId: null,
		totalPipelines: 0,
		errorCount: 0,
		lastError: null,
	};
	Object.defineProperty(agent, 'initialState', {
		value: defaultState,
		writable: true,
	});
	let currentState = { ...defaultState };
	Object.defineProperty(agent, 'state', {
		get: () => currentState,
		set: (v) => { currentState = v; },
	});
	(agent as Record<string, unknown>).setState = (newState: typeof currentState) => {
		currentState = newState;
		stateHistory.push({ ...newState });
	};

	const taNamespace = Symbol('TechnicalAnalysisAgent');
	const llmNamespace = Symbol('LLMAnalysisAgent');
	const brokerNamespace = Symbol('AlpacaBrokerAgent');

	Object.defineProperty(agent, 'env', {
		value: {
			DATABASE_HOST: 'test',
			DATABASE_USERNAME: 'test',
			DATABASE_PASSWORD: 'test',
			TechnicalAnalysisAgent: taNamespace,
			LLMAnalysisAgent: llmNamespace,
			AlpacaBrokerAgent: brokerNamespace,
		},
		writable: true,
	});

	await agent.onStart();

	const mockTA = createMockTAAgent(overrides?.ta);
	const mockLLM = createMockLLMAgent(overrides?.llm);
	const mockBroker = createMockBrokerAgent(overrides?.broker);

	registerMockAgent(taNamespace, mockTA);
	registerMockAgent(llmNamespace, mockLLM);
	registerMockAgent(brokerNamespace, mockBroker);

	return { agent, db, stateHistory, mockTA, mockLLM, mockBroker };
}
