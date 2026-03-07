import type {
	DiscussionMessage,
	DiscussionPhase,
	DiscussionThread,
	SessionState,
} from '@repo/data-ops/agents/session/types';
import { useMemo } from 'react';

interface DiscussionFeed {
	thread: DiscussionThread | null;
	messages: DiscussionMessage[];
	groupedByPhase: Record<DiscussionPhase, DiscussionMessage[]>;
	isActive: boolean;
	hasProposal: boolean;
}

function groupByPhase(messages: DiscussionMessage[]): Record<DiscussionPhase, DiscussionMessage[]> {
	const groups: Record<string, DiscussionMessage[]> = {};
	for (const msg of messages) {
		if (!groups[msg.phase]) {
			groups[msg.phase] = [];
		}
		groups[msg.phase].push(msg);
	}
	return groups as Record<DiscussionPhase, DiscussionMessage[]>;
}

export function useDiscussionFeed(state: SessionState | null): DiscussionFeed {
	const activeThread = state?.activeThread ?? null;

	const messages = useMemo(() => activeThread?.messages ?? [], [activeThread?.messages]);

	const groupedByPhase = useMemo(() => groupByPhase(messages), [messages]);

	return {
		thread: activeThread,
		messages,
		groupedByPhase,
		isActive: activeThread?.status === 'in_progress',
		hasProposal: activeThread?.proposal !== null && activeThread?.proposal !== undefined,
	};
}
