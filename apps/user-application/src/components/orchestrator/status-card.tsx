import { Bot, Pause, Play, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface OrchestratorStatusCardProps {
	userId: string;
}

export function OrchestratorStatusCard({ userId }: OrchestratorStatusCardProps) {
	const orch = useOrchestrator(userId);
	const isEnabled = orch.state?.enabled ?? false;

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Bot className="h-5 w-5" />
						<CardTitle className="text-lg">Orchestrator</CardTitle>
					</div>
					<Badge variant={isEnabled ? 'default' : 'secondary'}>
						{isEnabled ? 'Running' : 'Stopped'}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-3 gap-4 text-sm">
					<div>
						<div className="text-muted-foreground">Cycles</div>
						<div className="font-mono text-lg">{orch.state?.cycleCount ?? 0}</div>
					</div>
					<div>
						<div className="text-muted-foreground">Errors</div>
						<div className="font-mono text-lg">{orch.state?.errorCount ?? 0}</div>
					</div>
					<div>
						<div className="text-muted-foreground">Last Analysis</div>
						<div className="text-xs">
							{orch.state?.lastAnalysisAt ? formatTimeAgo(orch.state.lastAnalysisAt) : 'Never'}
						</div>
					</div>
				</div>

				<div className="flex gap-2">
					{isEnabled ? (
						<>
							<Button variant="outline" onClick={() => orch.disable()}>
								<Pause className="h-4 w-4 mr-1" /> Stop
							</Button>
							<Button variant="outline" onClick={() => orch.trigger()}>
								<RefreshCw className="h-4 w-4 mr-1" /> Trigger
							</Button>
						</>
					) : (
						<Button onClick={() => orch.enable()}>
							<Play className="h-4 w-4 mr-1" /> Start
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
