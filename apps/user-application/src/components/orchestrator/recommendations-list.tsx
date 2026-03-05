import type { Recommendation } from '@repo/data-ops/agents/orchestrator/types';
import { useQuery } from '@tanstack/react-query';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrchestrator } from '@/lib/orchestrator-connection';

function formatTimeAgo(dateStr: string): string {
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

const ACTION_CONFIG = {
	buy: { icon: TrendingUp, variant: 'default' as const, color: 'text-green-600' },
	sell: { icon: TrendingDown, variant: 'destructive' as const, color: 'text-red-600' },
	hold: { icon: Minus, variant: 'secondary' as const, color: 'text-muted-foreground' },
};

interface RecommendationsListProps {
	userId: string;
}

export function RecommendationsList({ userId }: RecommendationsListProps) {
	const orch = useOrchestrator(userId);

	const { data: recs = [] } = useQuery<Recommendation[]>({
		queryKey: ['orchestrator', userId, 'recommendations', orch.state?.cycleCount],
		queryFn: () => orch.getRecommendations(20),
		enabled: !!orch.ready,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">Recommendations</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{recs.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No recommendations yet. Enable orchestrator to start.
					</p>
				)}
				{recs.map((r) => {
					const cfg = ACTION_CONFIG[r.action as keyof typeof ACTION_CONFIG] ?? ACTION_CONFIG.hold;
					const Icon = cfg.icon;
					return (
						<div key={r.id} className="flex items-start gap-3 border-b pb-3 last:border-0">
							<Icon className={`h-5 w-5 mt-0.5 ${cfg.color}`} />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-mono font-medium">{r.symbol}</span>
									<Badge variant={cfg.variant}>{r.action.toUpperCase()}</Badge>
									<span className="text-xs text-muted-foreground">
										{(r.confidence * 100).toFixed(0)}%
									</span>
								</div>
								<p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.rationale}</p>
								<span className="text-xs text-muted-foreground">{formatTimeAgo(r.createdAt)}</span>
							</div>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}
