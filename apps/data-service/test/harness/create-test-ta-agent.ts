import Database from 'better-sqlite3';
import { TechnicalAnalysisAgent } from '@/agents/technical-analysis-agent';
import { createSqlTag } from './sql-template';

interface Schedule {
	id: string;
	callback: string;
	when: Date | number;
	type: 'once' | 'every';
}

export async function createTestTaAgent() {
	const db = new Database(':memory:');
	const sqlTag = createSqlTag(db);

	const agent = Object.create(TechnicalAnalysisAgent.prototype) as TechnicalAnalysisAgent;

	const schedules: Schedule[] = [];
	const stateHistory: unknown[] = [];

	Object.defineProperty(agent, 'sql', { value: sqlTag, writable: true });
	Object.defineProperty(agent, 'name', {
		value: 'test-user-123:AAPL',
		writable: true,
	});

	const defaultState = {
		lastComputeAt: null,
		symbol: '',
		latestPrice: null,
		signalCount: 0,
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

	Object.defineProperty(agent, 'env', {
		value: {
			DATABASE_HOST: 'test',
			DATABASE_USERNAME: 'test',
			DATABASE_PASSWORD: 'test',
		},
		writable: true,
	});

	await agent.onStart();

	return { agent, db, schedules, stateHistory };
}
