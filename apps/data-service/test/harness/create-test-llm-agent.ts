import Database from 'better-sqlite3';
import { LLMAnalysisAgent } from '@/agents/llm-analysis-agent';
import { createSqlTag } from './sql-template';

export async function createTestLLMAgent() {
	const db = new Database(':memory:');
	const sqlTag = createSqlTag(db);

	const agent = Object.create(LLMAnalysisAgent.prototype) as LLMAnalysisAgent;

	const stateHistory: unknown[] = [];

	Object.defineProperty(agent, 'sql', { value: sqlTag, writable: true });
	Object.defineProperty(agent, 'name', {
		value: 'test-user-123',
		writable: true,
	});

	const defaultState = {
		totalAnalyses: 0,
		totalTokens: 0,
		totalCostUsd: 0,
		lastAnalysisAt: null,
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

	Object.defineProperty(agent, 'env', {
		value: {
			DATABASE_HOST: 'test',
			DATABASE_USERNAME: 'test',
			DATABASE_PASSWORD: 'test',
			CREDENTIALS_ENCRYPTION_KEY: 'test-key',
			AI: {},
		},
		writable: true,
	});

	await agent.onStart();

	return { agent, db, stateHistory };
}

export function getMockLLMProvider() {
	const { createLLMProvider } = require('@repo/data-ops/providers/llm');
	const mockProvider = (createLLMProvider as ReturnType<typeof vi.fn>).mock.results[0]?.value;
	return mockProvider?.complete as ReturnType<typeof vi.fn>;
}
