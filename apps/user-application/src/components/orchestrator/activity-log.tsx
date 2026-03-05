import type { AgentAction, AgentActivity } from '@repo/data-ops/agents/orchestrator/types';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
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

const ACTION_VARIANT: Record<AgentAction, 'default' | 'secondary' | 'destructive' | 'outline'> = {
	started: 'default',
	stopped: 'secondary',
	signals_aggregated: 'outline',
	analysis_started: 'outline',
	analysis_completed: 'default',
	recommendation_logged: 'default',
	error: 'destructive',
};

interface ActivityLogProps {
	userId: string;
	limit?: number;
}

export function ActivityLog({ userId, limit = 20 }: ActivityLogProps) {
	const orch = useOrchestrator(userId);

	const { data: activities = [] } = useQuery<AgentActivity[]>({
		queryKey: ['orchestrator', userId, 'activity', orch.state?.cycleCount],
		queryFn: () => orch.getActivity(limit),
		enabled: !!orch.ready,
	});

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-2">
					<Activity className="h-5 w-5" />
					<CardTitle className="text-lg">Activity Log</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{activities.length === 0 && (
					<p className="text-sm text-muted-foreground">No activity recorded yet.</p>
				)}
				{activities.map((a) => (
					<div key={a.id} className="flex items-start gap-3 border-b pb-2 last:border-0">
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<Badge variant={ACTION_VARIANT[a.action] ?? 'secondary'}>
									{a.action.replace(/_/g, ' ')}
								</Badge>
								{a.symbol && <span className="font-mono text-sm font-medium">{a.symbol}</span>}
							</div>
							<p className="text-sm text-muted-foreground mt-1">{a.details}</p>
						</div>
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							{formatTimeAgo(a.timestamp)}
						</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
