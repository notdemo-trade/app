import type { TradeProposal } from '@repo/data-ops/agents/session/types';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowDown, ArrowLeft, ArrowUp, Clock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/lib/session-connection';

export const Route = createFileRoute('/_auth/session/proposals/')({
	component: ProposalHistoryPage,
});

const STATUS_CONFIG: Record<
	TradeProposal['status'],
	{
		key: string;
		variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline';
	}
> = {
	pending: { key: 'proposal.status.pending', variant: 'warning' },
	approved: { key: 'proposal.status.approved', variant: 'success' },
	rejected: { key: 'proposal.status.rejected', variant: 'destructive' },
	expired: { key: 'proposal.status.expired', variant: 'secondary' },
	executed: { key: 'proposal.status.executed', variant: 'success' },
	failed: { key: 'proposal.status.failed', variant: 'destructive' },
};

function ProposalHistoryPage() {
	const { data: authSession } = authClient.useSession();
	const userId = authSession?.user?.id;

	if (!userId) return null;

	return <ProposalHistoryContent userId={userId} />;
}

function ProposalHistoryContent({ userId }: { userId: string }) {
	const t = useTranslations();
	const session = useSession(userId);
	const [proposals, setProposals] = useState<TradeProposal[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchProposals = useCallback(() => {
		return session.getProposals();
	}, [session.getProposals]);

	useEffect(() => {
		fetchProposals()
			.then((data) => {
				setProposals(data);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, [fetchProposals]);

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<Link
					to="/session"
					className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="h-5 w-5" />
				</Link>
				<div>
					<h1 className="text-2xl font-bold text-foreground">{t('sessionPage.proposalHistory')}</h1>
					<p className="text-sm text-muted-foreground">{t('sessionPage.proposalHistoryDesc')}</p>
				</div>
			</div>

			{loading ? (
				<Card>
					<CardContent className="py-8 text-center text-sm text-muted-foreground">
						{t('sessionPage.loadingProposals')}
					</CardContent>
				</Card>
			) : proposals.length === 0 ? (
				<Card>
					<CardContent className="py-8 text-center text-sm text-muted-foreground">
						{t('sessionPage.noProposals')}
					</CardContent>
				</Card>
			) : (
				<div className="space-y-2">
					{proposals.map((proposal) => (
						<ProposalListItem key={proposal.id} proposal={proposal} />
					))}
				</div>
			)}
		</div>
	);
}

function ProposalListItem({ proposal }: { proposal: TradeProposal }) {
	const t = useTranslations();
	const isBuy = proposal.action === 'buy';
	const statusConfig = STATUS_CONFIG[proposal.status];
	const hasWarnings = proposal.warnings && proposal.warnings.length > 0;
	const isFailed = proposal.status === 'failed';

	return (
		<Link
			to="/session/proposals/$proposalId"
			params={{ proposalId: proposal.id }}
			className="block"
		>
			<Card className="transition-colors hover:bg-accent/50">
				<CardContent className="flex items-center gap-4 py-3">
					<div className="flex items-center gap-2">
						{isBuy ? (
							<ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400" />
						) : (
							<ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400" />
						)}
						<Badge variant={isBuy ? 'success' : 'destructive'} className="text-xs">
							{proposal.action.toUpperCase()}
						</Badge>
					</div>

					<span className="font-semibold text-foreground">{proposal.symbol}</span>

					<Badge
						variant={
							proposal.confidence >= 0.7
								? 'success'
								: proposal.confidence >= 0.4
									? 'warning'
									: 'destructive'
						}
						className="text-xs"
					>
						{(proposal.confidence * 100).toFixed(0)}%
					</Badge>

					{hasWarnings && (
						<Badge variant="warning" className="text-xs">
							{t('common.warning')}
						</Badge>
					)}

					<span className="flex-1 truncate text-sm text-muted-foreground">
						{proposal.rationale}
					</span>

					<Badge variant={statusConfig.variant} className="text-xs">
						{t(statusConfig.key)}
					</Badge>

					{isFailed && (
						<Badge variant="outline" className="text-xs">
							{t('proposal.retryAvailable')}
						</Badge>
					)}

					<span className="flex items-center gap-1 text-xs text-muted-foreground">
						<Clock className="h-3 w-3" />
						{new Date(proposal.createdAt).toLocaleDateString(undefined, {
							month: 'short',
							day: 'numeric',
							hour: '2-digit',
							minute: '2-digit',
						})}
					</span>
				</CardContent>
			</Card>
		</Link>
	);
}
