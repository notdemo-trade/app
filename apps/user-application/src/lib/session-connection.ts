import { useAgentChat } from '@cloudflare/ai-chat/react';
import type {
	DiscussionThread,
	ResetResult,
	SessionConfig,
	SessionState,
	TradeProposal,
} from '@repo/data-ops/agents/session/types';
import { useAgent } from 'agents/react';
import { useCallback, useMemo, useReducer } from 'react';

const AGENT_HOST = import.meta.env.VITE_DATA_SERVICE_URL || 'http://localhost:8788';

interface ToolApprovalPart {
	type: 'tool';
	toolCallId: string;
	toolName: string;
	state: string;
	args: Record<string, unknown>;
}

function stateReducer(_prev: SessionState | null, next: SessionState): SessionState {
	return next;
}

export function useSession(userId: string) {
	const [state, dispatchState] = useReducer(stateReducer, null);

	const onStateUpdate = useCallback((newState: SessionState) => dispatchState(newState), []);

	const agentConnection = useAgent({
		agent: 'SessionAgent',
		name: userId,
		host: AGENT_HOST,
		onStateUpdate,
	});

	const agent = useAgentChat({
		agent: agentConnection,
		getInitialMessages: null,
	});

	const pendingApprovals = useMemo(() => {
		if (!agent.messages) return [];
		return agent.messages
			.flatMap((m) => (m.parts ?? []) as ToolApprovalPart[])
			.filter((p) => p.type === 'tool' && p.state === 'approval-required');
	}, [agent.messages]);

	return {
		// Chat
		messages: agent.messages,
		sendMessage: agent.sendMessage,
		clearMessages: agent.clearHistory,

		// State (real-time via WebSocket)
		state,

		// Tool approvals
		pendingApprovals,
		approveToolCall: (toolCallId: string) =>
			agent.addToolApprovalResponse({
				id: toolCallId,
				approved: true,
			}),
		rejectToolCall: (toolCallId: string) =>
			agent.addToolApprovalResponse({
				id: toolCallId,
				approved: false,
			}),

		// RPC (via callable methods)
		start: () => agentConnection.call('start', []),
		stop: () => agentConnection.call('stop', []),
		updateConfig: (config: Partial<SessionConfig>) =>
			agentConnection.call('updateConfig', [config]),
		getConfig: () => agentConnection.call('getConfig', []) as Promise<SessionConfig>,
		getStatus: () => agentConnection.call('getStatus', []),
		triggerAnalysis: (symbol: string) => agentConnection.call('triggerAnalysis', [symbol]),
		getThreads: (params?: { limit?: number; status?: string }) =>
			agentConnection.call('getThreads', [params]) as Promise<DiscussionThread[]>,
		getThread: (threadId: string) =>
			agentConnection.call('getThread', [threadId]) as Promise<DiscussionThread | null>,
		getProposals: (status?: string) =>
			agentConnection.call('getProposals', [status]) as Promise<TradeProposal[]>,
		approveProposal: (proposalId: string) =>
			agentConnection.call('approveProposal', [proposalId]) as Promise<{
				status: string;
				message: string;
			}>,
		rejectProposal: (proposalId: string) =>
			agentConnection.call('rejectProposal', [proposalId]) as Promise<{
				status: string;
				message: string;
			}>,
		resetData: () => agentConnection.call('resetData', []) as Promise<ResetResult>,
	};
}
