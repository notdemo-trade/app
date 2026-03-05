import type {
	OrchestratorConfig,
	OrchestratorState,
} from '@repo/data-ops/agents/orchestrator/types';
import { useAgent } from 'agents/react';
import { useState } from 'react';

const AGENT_HOST = import.meta.env.VITE_DATA_SERVICE_URL || 'http://localhost:8788';

export function useOrchestrator(userId: string) {
	const [state, setState] = useState<OrchestratorState | null>(null);

	const agent = useAgent<OrchestratorState>({
		agent: 'OrchestratorAgent',
		name: userId,
		host: AGENT_HOST,
		onStateUpdate: (newState) => setState(newState),
	});

	return {
		state,
		enable: () => agent.call('enable'),
		disable: () => agent.call('disable'),
		getStatus: () => agent.call('getStatus'),
		getConfig: () => agent.call('getOrchestratorConfig'),
		updateConfig: (updates: Partial<OrchestratorConfig>) => agent.call('updateConfig', [updates]),
		updateEntitlement: (agentType: string, enabled: boolean) =>
			agent.call('updateEntitlement', [agentType, enabled]),
		trigger: () => agent.call('trigger'),
		getActivity: (limit?: number) => agent.call('getActivity', [limit]),
		getRecommendations: (limit?: number) => agent.call('getRecommendations', [limit]),
		ready: agent.ready,
	};
}
