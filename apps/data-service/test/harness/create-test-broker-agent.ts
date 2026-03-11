import Database from 'better-sqlite3';
import { AlpacaBrokerAgent } from '@/agents/alpaca-broker-agent';
import { createSqlTag } from './sql-template';

export async function createTestBrokerAgent() {
	const db = new Database(':memory:');
	const sqlTag = createSqlTag(db);

	const agent = Object.create(AlpacaBrokerAgent.prototype) as AlpacaBrokerAgent;

	const stateHistory: unknown[] = [];

	Object.defineProperty(agent, 'sql', { value: sqlTag, writable: true });
	Object.defineProperty(agent, 'name', {
		value: 'test-user-123',
		writable: true,
	});

	const defaultState = {
		lastSyncAt: null,
		positionCount: 0,
		portfolioValue: null,
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
			CREDENTIALS_ENCRYPTION_KEY: 'test-key',
		},
		writable: true,
	});

	await agent.onStart();

	return { agent, db, stateHistory };
}
