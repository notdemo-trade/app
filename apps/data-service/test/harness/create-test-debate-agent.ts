import Database from 'better-sqlite3';
import { DebateOrchestratorAgent } from '@/agents/debate-orchestrator-agent';
import { registerMockAgent } from '../setup';
import { createMockLLMAgent } from './mock-llm-agent';
import { createSqlTag } from './sql-template';

export async function createTestDebateAgent(llmOverrides?: Record<string, unknown>) {
	const db = new Database(':memory:');
	const sqlTag = createSqlTag(db);

	const agent = Object.create(DebateOrchestratorAgent.prototype) as DebateOrchestratorAgent;

	const stateHistory: unknown[] = [];

	Object.defineProperty(agent, 'sql', { value: sqlTag, writable: true });
	Object.defineProperty(agent, 'name', {
		value: 'test-user-123:AAPL',
		writable: true,
	});

	const defaultState = {
		activeDebateId: null,
		totalDebates: 0,
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
		set: (v) => {
			currentState = v;
		},
	});
	(agent as Record<string, unknown>).setState = (newState: typeof currentState) => {
		currentState = newState;
		stateHistory.push({ ...newState });
	};

	const llmNamespace = Symbol('LLMAnalysisAgent');
	Object.defineProperty(agent, 'env', {
		value: {
			DATABASE_HOST: 'test',
			DATABASE_USERNAME: 'test',
			DATABASE_PASSWORD: 'test',
			LLMAnalysisAgent: llmNamespace,
		},
		writable: true,
	});

	await agent.onStart();

	const mockLLM = createMockLLMAgent(llmOverrides);
	registerMockAgent(llmNamespace, mockLLM);

	return { agent, db, stateHistory, mockLLM };
}
