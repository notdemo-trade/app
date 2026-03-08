import type { DiscussionThread as DiscussionThreadType } from '@repo/data-ops/agents/session/types';
import { Clock, MessageSquare } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTip } from '@/components/ui/info-tip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { DiscussionMessage } from './discussion-message';
import { TradeProposalCard } from './trade-proposal-card';

function formatTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function formatDuration(startedAt: number, completedAt: number | null): string {
	const end = completedAt ?? Date.now();
	const seconds = Math.floor((end - startedAt) / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

const STATUS_CONFIG = {
	in_progress: { label: 'In Progress', variant: 'default' as const },
	completed: { label: 'Completed', variant: 'success' as const },
	failed: { label: 'Failed', variant: 'destructive' as const },
};

interface DiscussionThreadProps {
	thread: DiscussionThreadType;
	onApproveProposal?: (proposalId: string) => void;
	onRejectProposal?: (proposalId: string) => void;
}

export function DiscussionThread({
	thread,
	onApproveProposal,
	onRejectProposal,
}: DiscussionThreadProps) {
	const t = useTranslations();
	const statusConfig = STATUS_CONFIG[thread.status];
	const scrollEndRef = useRef<HTMLDivElement>(null);
	const prevCountRef = useRef(thread.messages.length);

	if (thread.messages.length !== prevCountRef.current) {
		prevCountRef.current = thread.messages.length;
		queueMicrotask(() => {
			scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
		});
	}

	useEffect(() => {
		scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, []);

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<MessageSquare className="h-4 w-4 text-muted-foreground" />
						<CardTitle className="text-base">{thread.symbol}</CardTitle>
						<Badge variant="outline" className="text-xs">
							{thread.orchestrationMode === 'debate' ? 'Debate' : 'Pipeline'}
						</Badge>
						<InfoTip content={t('session.tips.discussionFeed')} side="right" />
					</div>
					<Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
				</div>
				<div className="flex items-center gap-3 text-xs text-muted-foreground">
					<span>{formatTimestamp(thread.startedAt)}</span>
					<span className="flex items-center gap-1">
						<Clock className="h-3 w-3" />
						{formatDuration(thread.startedAt, thread.completedAt)}
					</span>
					<span>
						{thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}
					</span>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				<ScrollArea className={cn('pr-3', thread.messages.length > 5 ? 'h-[400px]' : '')}>
					<div className="divide-y divide-border">
						{thread.messages.map((msg) => (
							<DiscussionMessage key={msg.id} message={msg} />
						))}
						<div ref={scrollEndRef} />
					</div>
				</ScrollArea>

				{thread.proposal && (
					<div className="mt-4 border-t border-border pt-4">
						<TradeProposalCard
							proposal={thread.proposal}
							onApprove={
								onApproveProposal ? () => onApproveProposal(thread.proposal?.id ?? '') : undefined
							}
							onReject={
								onRejectProposal ? () => onRejectProposal(thread.proposal?.id ?? '') : undefined
							}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
