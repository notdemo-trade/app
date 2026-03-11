import Database from 'better-sqlite3';
import { SessionAgent } from '@/agents/session-agent';
import { createMockBroker } from './mock-broker';
import { createMockDebateOrchestrator, createMockPipelineOrchestrator } from './mock-orchestrators';
import { createSqlTag } from './sql-template';

interface Schedule {
	id: string;
	callback: string;
	when: Date | number;
	type: 'once' | 'every';
}

interface TestAgentOptions {
	brokerOverrides?: Record<string, unknown>;
	debateOverrides?: Record<string, unknown>;
	pipelineOverrides?: Record<string, unknown>;
	tradingConfig?: Record<string, unknown> | null;
}

export async function createTestAgent(options: TestAgentOptions = {}) {
	const db = new Database(':memory:');
	const sqlTag = createSqlTag(db);

	const agent = Object.create(SessionAgent.prototype) as SessionAgent;

	const schedules: Schedule[] = [];
	const stateHistory: unknown[] = [];

	Object.defineProperty(agent, 'sql', { value: sqlTag, writable: true });
	Object.defineProperty(agent, 'name', {
		value: 'test-user-123',
		writable: true,
	});

	const defaultState = {
		enabled: false,
		lastCycleAt: null,
		cycleCount: 0,
		analysisIntervalSec: 120,
		activeThreadId: null,
		activeThread: null,
		pendingProposalCount: 0,
		errorCount: 0,
		lastError: null,
		lastSkipReason: null,
	};
	// Class field initializers don't run with Object.create, so set explicitly
	Object.defineProperty(agent, 'initialState', {
		value: defaultState,
		writable: true,
	});
	let currentState = { ...defaultState };
	Object.defineProperty(agent, 'state', {
		get: () => currentState,
		set: (v) => {
			currentState = v;
		},
	});
	(agent as Record<string, unknown>).setState = (newState: typeof currentState) => {
		currentState = newState;
		stateHistory.push({ ...newState });
	};

	(agent as Record<string, unknown>).schedule = async (when: Date | number, callback: string) => {
		schedules.push({
			id: crypto.randomUUID(),
			callback,
			when,
			type: 'once',
		});
	};
	(agent as Record<string, unknown>).scheduleEvery = async (sec: number, callback: string) => {
		schedules.push({
			id: crypto.randomUUID(),
			callback,
			when: sec,
			type: 'every',
		});
	};
	(agent as Record<string, unknown>).getSchedules = () => [...schedules];
	(agent as Record<string, unknown>).cancelSchedule = async (id: string) => {
		const idx = schedules.findIndex((s) => s.id === id);
		if (idx >= 0) schedules.splice(idx, 1);
	};

	(agent as Record<string, unknown>).saveMessages = async () => {};
	Object.defineProperty(agent, 'messages', {
		get: () => [],
		configurable: true,
	});

	const broadcasts: string[] = [];
	(agent as Record<string, unknown>).broadcast = (data: unknown) => {
		broadcasts.push(JSON.stringify(data));
	};

	const mockBroker = createMockBroker(options.brokerOverrides);
	const mockDebate = createMockDebateOrchestrator(options.debateOverrides);
	const mockPipeline = createMockPipelineOrchestrator(options.pipelineOverrides);

	Object.defineProperty(agent, 'env', {
		value: {
			DATABASE_HOST: 'test',
			DATABASE_USERNAME: 'test',
			DATABASE_PASSWORD: 'test',
			AlpacaBrokerAgent: Symbol('AlpacaBrokerAgent'),
			DebateOrchestratorAgent: Symbol('DebateOrchestratorAgent'),
			PipelineOrchestratorAgent: Symbol('PipelineOrchestratorAgent'),
			TechnicalAnalysisAgent: Symbol('TechnicalAnalysisAgent'),
			LLMAnalysisAgent: Symbol('LLMAnalysisAgent'),
		},
		writable: true,
	});

	await agent.onStart();

	return {
		agent,
		db,
		schedules,
		stateHistory,
		broadcasts,
		mocks: { broker: mockBroker, debate: mockDebate, pipeline: mockPipeline },
	};
}
