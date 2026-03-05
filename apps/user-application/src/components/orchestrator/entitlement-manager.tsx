import type {
	AgentEntitlement,
	OrchestratorStatus,
} from '@repo/data-ops/agents/orchestrator/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useOrchestrator } from '@/lib/orchestrator-connection';

const AGENT_LABELS: Record<string, string> = {
	TechnicalAnalysisAgent: 'Technical Analysis',
	LLMAnalysisAgent: 'AI Analysis',
};

interface EntitlementManagerProps {
	userId: string;
}

export function EntitlementManager({ userId }: EntitlementManagerProps) {
	const orch = useOrchestrator(userId);
	const queryClient = useQueryClient();

	const { data: entitlements = [] } = useQuery<AgentEntitlement[]>({
		queryKey: ['orchestrator', userId, 'entitlements'],
		queryFn: async () => {
			const status = (await orch.getStatus()) as OrchestratorStatus;
			return status.entitlements;
		},
		enabled: !!orch.ready,
	});

	const toggleMutation = useMutation({
		mutationFn: async ({ agentType, enabled }: { agentType: string; enabled: boolean }) =>
			orch.updateEntitlement(agentType, enabled),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ['orchestrator', userId, 'entitlements'] }),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">Active Agents</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{entitlements.map((e) => (
					<div key={e.agentType} className="flex items-center justify-between">
						<Label>{AGENT_LABELS[e.agentType] ?? e.agentType}</Label>
						<Switch
							checked={e.enabled}
							onCheckedChange={(v) => toggleMutation.mutate({ agentType: e.agentType, enabled: v })}
						/>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
