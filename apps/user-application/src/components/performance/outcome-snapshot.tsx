import type {
	OutcomeSnapshot as OutcomeSnapshotType,
	ProposalOutcome,
} from '@repo/data-ops/agents/memory/types';
import { Activity } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OutcomeSnapshotProps {
	outcome: ProposalOutcome;
	snapshot: OutcomeSnapshotType | null;
}

function formatTimeAgo(ts: number): string {
	const diffMs = Date.now() - ts;
	const mins = Math.floor(diffMs / 60_000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	return `${hours}h ago`;
}

export function OutcomeSnapshotCard({ outcome, snapshot }: OutcomeSnapshotProps) {
	const t = useTranslations('performance');
	const isPositive = snapshot ? snapshot.unrealizedPnl >= 0 : false;

	return (
		<Card className="border-primary/20">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-sm font-medium">{outcome.symbol}</CardTitle>
					<div className="flex items-center gap-1 text-xs text-primary">
						<Activity className="h-3 w-3 animate-pulse" />
						<span>{t('live')}</span>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="flex items-baseline justify-between">
					<span className="text-xs text-muted-foreground">{t('currentPrice')}</span>
					<span className="font-mono text-sm text-foreground">
						${snapshot?.currentPrice.toFixed(2) ?? '—'}
					</span>
				</div>
				<div className="flex items-baseline justify-between">
					<span className="text-xs text-muted-foreground">{t('unrealizedPnl')}</span>
					{snapshot ? (
						<div className="text-right">
							<span
								className={`font-mono text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}
							>
								{isPositive ? '+' : ''}${snapshot.unrealizedPnl.toFixed(2)}
							</span>
							<span className={`ml-1 text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
								({isPositive ? '+' : ''}
								{snapshot.unrealizedPnlPct.toFixed(2)}%)
							</span>
						</div>
					) : (
						<span className="text-sm text-muted-foreground">—</span>
					)}
				</div>
				{snapshot && (
					<p className="text-right text-xs text-muted-foreground">
						{formatTimeAgo(snapshot.snapshotAt)}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
