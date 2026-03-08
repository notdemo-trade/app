import type {
	DiscussionThread as DiscussionThreadType,
	TradeProposal,
} from '@repo/data-ops/agents/session/types';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DiscussionThread, TradeProposalCard } from '@/components/agents';
import { Card, CardContent } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/lib/session-connection';

export const Route = createFileRoute('/_auth/session/proposals/$proposalId')({
	component: ProposalDetailPage,
});

function ProposalDetailPage() {
	const { data: authSession } = authClient.useSession();
	const userId = authSession?.user?.id;
	const { proposalId } = Route.useParams();

	if (!userId) return null;

	return <ProposalDetailContent userId={userId} proposalId={proposalId} />;
}

interface DetailState {
	proposal: TradeProposal | null;
	thread: DiscussionThreadType | null;
	loading: boolean;
}

function ProposalDetailContent({ userId, proposalId }: { userId: string; proposalId: string }) {
	const session = useSession(userId);
	const [state, setState] = useState<DetailState>({ proposal: null, thread: null, loading: true });

	const loadData = useCallback(async () => {
		try {
			const proposals = await session.getProposals();
			const proposal = proposals.find((p) => p.id === proposalId) ?? null;

			let thread: DiscussionThreadType | null = null;
			if (proposal) {
				thread = await session.getThread(proposal.threadId);
			}

			setState({ proposal, thread, loading: false });
		} catch {
			setState({ proposal: null, thread: null, loading: false });
		}
	}, [proposalId, session.getProposals, session.getThread]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	if (state.loading) {
		return (
			<div className="space-y-4">
				<BackLink />
				<Card>
					<CardContent className="py-8 text-center text-sm text-muted-foreground">
						Loading...
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!state.proposal) {
		return (
			<div className="space-y-4">
				<BackLink />
				<Card>
					<CardContent className="py-8 text-center text-sm text-muted-foreground">
						Proposal not found
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<BackLink />

			<TradeProposalCard proposal={state.proposal} />

			{state.thread ? (
				<DiscussionThread thread={state.thread} />
			) : (
				<Card>
					<CardContent className="py-8 text-center text-sm text-muted-foreground">
						Discussion thread not available
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function BackLink() {
	return (
		<Link
			to="/session/proposals"
			className="inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft className="h-4 w-4" />
			Back to Proposal History
		</Link>
	);
}
